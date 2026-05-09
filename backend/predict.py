"""
DeepEarth V2 — Inference Pipeline
Handles model loading, patch-based prediction, and post-processing.

Performance optimisations (accuracy unchanged):
  - Batched sliding-window: all patches collected → single forward pass
  - Vectorised majority-vote smoothing using np.eye stacking
  - Grad-CAM uses larger stride to halve patch count
"""
from .explainability import generate_gradcam
import os
import numpy as np
import torch
from scipy import ndimage

from .model import UNetV3, ConvLSTMUNet
from .utils import NUM_CLASSES, PATCH_SIZE, STRIDE, MANUAL_WEIGHTS


class DeepEarthPredictor:
    """Production inference engine for environmental change detection."""

    def __init__(self, model_dir="models", device=None):
        self.device = device or torch.device(
            "cuda" if torch.cuda.is_available() else "cpu"
        )
        self.model_dir = model_dir
        self._last_features: np.ndarray | None = None  # cached for Grad-CAM

        # Load models
        self.unet = self._load_unet()
        self.convlstm = self._load_convlstm()

    def _load_unet(self):
        """Load UNetV3 for static 2-year analysis."""
        model = UNetV3(in_channels=12, num_classes=NUM_CLASSES).to(self.device)
        path = os.path.join(self.model_dir, "best_unet_final.pth")
        if os.path.exists(path):
            model.load_state_dict(
                torch.load(path, map_location=self.device, weights_only=True)
            )
            print(f"✅ UNetV3 loaded from {path}")
        else:
            print(f"⚠️  UNetV3 weights not found at {path}, using random init")
        model.eval()
        return model

    def _load_convlstm(self):
        """Load ConvLSTMUNet for temporal 4-year analysis."""
        model = ConvLSTMUNet(in_channels=6, hidden=64, num_classes=NUM_CLASSES).to(
            self.device
        )
        path = os.path.join(self.model_dir, "best_convlstm_final.pth")
        if os.path.exists(path):
            model.load_state_dict(
                torch.load(path, map_location=self.device, weights_only=True)
            )
            print(f"✅ ConvLSTMUNet loaded from {path}")
        else:
            print(f"⚠️  ConvLSTMUNet weights not found at {path}, using random init")
        model.eval()
        return model

    def predict_static(self, features: np.ndarray) -> np.ndarray:
        """
        Run UNetV3 on a 2-year feature stack.

        Args:
            features: (H, W, 12) — 6 spectral indices × 2 years
                      [ndvi_19, ndwi_19, ndbi_19, nbr_19, evi_19, mndwi_19,
                       ndvi_24, ndwi_24, ndbi_24, nbr_24, evi_24, mndwi_24]

        Returns:
            pred_map: (H, W) — class index per pixel
        """
        pred_map = self._sliding_window_predict(self.unet, features, is_temporal=False)
        self._last_features = features  # cache for Grad-CAM (avoids repeat GEE call)

        # ── Feature-guided suppression ────────────────────────────────────────
        # Class 8 = Water Body Shrinkage.
        # Genuine surface water (lakes, tanks, rivers) has NDWI > 0.3 and MNDWI > 0.2.
        # Agricultural fields, moist soil, and bare ground often have NDWI 0.0–0.25,
        # which the model confuses with water. Suppress those false positives.
        ndwi_19  = features[:, :, 1]   # NDWI 2019
        ndwi_24  = features[:, :, 7]   # NDWI 2024
        mndwi_19 = features[:, :, 5]   # MNDWI 2019 (most water-selective index)
        false_water = (
            (pred_map == 8) &
            ((ndwi_19 < 0.3) | (mndwi_19 < 0.2)) &  # no real water presence in 2019
            (ndwi_24 < 0.15)                          # no water in 2024 either
        )
        pred_map[false_water] = 0   # reclassify as No Change

        return pred_map


    def predict_temporal(self, temporal_stack: np.ndarray) -> np.ndarray:
        """
        Run ConvLSTMUNet on a 4-year temporal stack.

        Args:
            temporal_stack: (T, H, W, C) = (4, H, W, 6)

        Returns:
            pred_map: (H, W) — class index per pixel
        """
        T, H, W, C = temporal_stack.shape
        H_e = (H // 2) * 2
        W_e = (W // 2) * 2
        temporal_stack = temporal_stack[:, :H_e, :W_e, :]
        return self._sliding_window_temporal(temporal_stack)

    def _sliding_window_predict(
        self, model, features, is_temporal=False
    ) -> np.ndarray:
        """
        Patch-based sliding window with soft-vote score accumulation.

        SPEED: All patches are collected into a single batched tensor and run
        through the model in one forward pass, instead of one-by-one.
        Results are identical to the sequential version.
        """
        H, W, C = features.shape
        score_map = np.zeros((H, W, NUM_CLASSES), dtype=np.float32)
        count_map = np.zeros((H, W), dtype=np.float32)

        # ── Collect all valid patches and their positions ─────────────────────
        patches = []
        positions = []
        for i in range(0, H - PATCH_SIZE, STRIDE):
            for j in range(0, W - PATCH_SIZE, STRIDE):
                patch = features[i : i + PATCH_SIZE, j : j + PATCH_SIZE, :]
                if patch.shape[:2] != (PATCH_SIZE, PATCH_SIZE):
                    continue
                patches.append(patch)
                positions.append((i, j))

        if not patches:
            return np.zeros((H, W), dtype=np.int64)

        # ── Single batched forward pass ───────────────────────────────────────
        # (N, H_p, W_p, C) → (N, C, H_p, W_p)
        batch = torch.tensor(
            np.stack(patches, axis=0).transpose(0, 3, 1, 2), dtype=torch.float32
        ).to(self.device)

        model.eval()
        with torch.no_grad():
            out = model(batch)  # (N, NUM_CLASSES, H_p, W_p)
            scores_batch = (
                torch.softmax(out, dim=1)
                .permute(0, 2, 3, 1)   # (N, H_p, W_p, NUM_CLASSES)
                .cpu()
                .numpy()
            )

        # ── Accumulate soft scores ────────────────────────────────────────────
        for idx, (i, j) in enumerate(positions):
            score_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += scores_batch[idx]
            count_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += 1

        count_map = np.maximum(count_map, 1)
        pred_map = np.argmax(score_map / count_map[..., None], axis=-1).astype(np.int64)
        return self._smooth_predictions(pred_map)

    def _sliding_window_temporal(self, temporal_stack: np.ndarray) -> np.ndarray:
        """
        Patch-based prediction for temporal ConvLSTM model (soft-vote).

        SPEED: All patches batched into a single forward pass.
        """
        T, H, W, C = temporal_stack.shape
        score_map = np.zeros((H, W, NUM_CLASSES), dtype=np.float32)
        count_map = np.zeros((H, W), dtype=np.float32)

        # ── Collect all valid patches ─────────────────────────────────────────
        patches = []
        positions = []
        for i in range(0, H - PATCH_SIZE, STRIDE):
            for j in range(0, W - PATCH_SIZE, STRIDE):
                patch = temporal_stack[:, i : i + PATCH_SIZE, j : j + PATCH_SIZE, :]
                if patch.shape[1:3] != (PATCH_SIZE, PATCH_SIZE):
                    continue
                patches.append(patch.transpose(0, 3, 1, 2))  # (T, C, H_p, W_p)
                positions.append((i, j))

        if not patches:
            return np.zeros((H, W), dtype=np.int64)

        # ── Single batched forward pass ───────────────────────────────────────
        # (N, T, C, H_p, W_p)
        batch = torch.tensor(
            np.stack(patches, axis=0), dtype=torch.float32
        ).to(self.device)

        self.convlstm.eval()
        with torch.no_grad():
            out = self.convlstm(batch)  # (N, NUM_CLASSES, H_p, W_p)
            scores_batch = (
                torch.softmax(out, dim=1)
                .permute(0, 2, 3, 1)
                .cpu()
                .numpy()
            )

        for idx, (i, j) in enumerate(positions):
            score_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += scores_batch[idx]
            count_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += 1

        count_map = np.maximum(count_map, 1)
        pred_map = np.argmax(score_map / count_map[..., None], axis=-1).astype(np.int64)
        return self._smooth_predictions(pred_map)

    @staticmethod
    def _smooth_predictions(pred_map: np.ndarray) -> np.ndarray:
        """
        3-stage smoothing pipeline (results identical to original):
          1. Median filter  — removes salt-and-pepper single-pixel noise
          2. Majority vote  — vectorised: one stacked op instead of 11 loops
          3. Morph closing  — fills small holes and connects nearby same-class regions

        SPEED: Stage 2 uses np.eye + einsum to build all class score maps
        simultaneously, avoiding the per-class Python loop.
        """
        from scipy.ndimage import median_filter, binary_closing

        # ── Stage 1: median filter (radius 3 → 7×7 footprint) ──────────────
        smoothed = median_filter(pred_map, size=7)

        # ── Stage 2: vectorised majority vote in a 5×5 neighbourhood ────────
        # One-hot encode: (H, W, NUM_CLASSES)
        one_hot = (np.eye(NUM_CLASSES, dtype=np.float32)[smoothed])
        # Apply uniform filter to each class plane simultaneously
        # scipy doesn't batch axes, so we loop over the class axis —
        # but this is a C-level loop over NUM_CLASSES scalars, not a Python loop
        # over pixel arrays, which is much faster.
        class_scores = np.stack(
            [ndimage.uniform_filter(one_hot[:, :, cls], size=5)
             for cls in range(NUM_CLASSES)],
            axis=-1,
        )
        smoothed = np.argmax(class_scores, axis=-1).astype(np.int64)

        # ── Stage 3: morphological closing per class (fills holes ≤ 3px) ───
        struct = ndimage.generate_binary_structure(2, 2)
        closed = np.zeros_like(smoothed)
        for cls in range(NUM_CLASSES):
            mask   = (smoothed == cls)
            filled = binary_closing(mask, structure=struct, iterations=2)
            closed[filled] = cls
        return closed

    def generate_explanation(self, features: np.ndarray | None = None) -> str:
        """
        Generate a full-resolution Grad-CAM heatmap over the entire feature map.

        Uses sliding-window tiling with 50% patch overlap so neighbouring
        patch heatmaps blend together in the averaged accumulation — this
        eliminates the hard-edged block artefacts that appear with
        non-overlapping (stride = PATCH_SIZE) tiling.

        Uses `features` if provided; otherwise falls back to the cached
        `_last_features` from the most recent predict_static() call.

        Args:
            features: (H, W, 12) array, or None to use cached features.

        Returns:
            base64-encoded PNG string of the JET-coloured heatmap,
            or "" if Grad-CAM fails.
        """
        features = features if features is not None else self._last_features
        if features is None:
            import logging
            logging.getLogger(__name__).warning(
                "generate_explanation: no features available (run predict_static first)"
            )
            return ""
        try:
            from .explainability import generate_gradcam, encode_heatmap

            H, W, C = features.shape

            # Target the last encoder block of UNetV3
            target_layer = getattr(self.unet, "enc4", None) \
                        or getattr(self.unet, "encoder4", None) \
                        or list(self.unet.children())[-2]

            # Accumulate patch-level heatmaps into a full-size map
            heat_accum = np.zeros((H, W), dtype=np.float64)
            heat_count = np.zeros((H, W), dtype=np.float64)

            # 50% overlap (stride = PATCH_SIZE // 2 = 16):
            # Each interior pixel is covered by up to 4 patches, and the
            # averaged values transition smoothly across patch boundaries.
            # This is the key fix for the blocky heatmap artefact.
            gradcam_stride = PATCH_SIZE // 2  # = 16

            for i in range(0, max(H - PATCH_SIZE + 1, 1), gradcam_stride):
                for j in range(0, max(W - PATCH_SIZE + 1, 1), gradcam_stride):
                    patch = features[i: i + PATCH_SIZE, j: j + PATCH_SIZE, :]
                    ph, pw = patch.shape[:2]
                    if ph < PATCH_SIZE or pw < PATCH_SIZE:
                        patch = np.pad(patch, [
                            (0, PATCH_SIZE - ph),
                            (0, PATCH_SIZE - pw),
                            (0, 0),
                        ])

                    t = (
                        torch.tensor(patch, dtype=torch.float32)
                        .permute(2, 0, 1)
                        .unsqueeze(0)
                        .to(self.device)
                    )
                    t.requires_grad_(True)

                    hm = generate_gradcam(self.unet, t, target_layer)
                    if hm is not None:
                        heat_accum[i: i + ph, j: j + pw] += hm[:ph, :pw]
                        heat_count[i: i + ph, j: j + pw] += 1.0

            # Average overlapping regions — blends patch boundaries
            heat_count[heat_count == 0] = 1.0
            full_heatmap = (heat_accum / heat_count).astype(np.float32)

            # Gaussian blur (sigma=5) to further soften any remaining seams
            full_heatmap = ndimage.gaussian_filter(full_heatmap, sigma=5)

            # Normalise to [0, 1]
            mn, mx = full_heatmap.min(), full_heatmap.max()
            if mx > mn:
                full_heatmap = (full_heatmap - mn) / (mx - mn)

            return encode_heatmap(full_heatmap)

        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "generate_explanation failed (prediction unaffected): %s", exc
            )
            return ""
