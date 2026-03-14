"""
DeepEarth V2 — Inference Pipeline
Handles model loading, patch-based prediction, and post-processing.
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

        Returns:
            pred_map: (H, W) — class index per pixel
        """
        return self._sliding_window_predict(self.unet, features, is_temporal=False)

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
        """Patch-based sliding window with overlap averaging."""
        H, W, C = features.shape
        pred_map = np.zeros((H, W), dtype=np.float32)
        count_map = np.zeros((H, W), dtype=np.float32)

        model.eval()
        with torch.no_grad():
            for i in range(0, H - PATCH_SIZE, STRIDE):
                for j in range(0, W - PATCH_SIZE, STRIDE):
                    patch = features[i : i + PATCH_SIZE, j : j + PATCH_SIZE, :]
                    if patch.shape[:2] != (PATCH_SIZE, PATCH_SIZE):
                        continue

                    # (H, W, C) → (1, C, H, W)
                    t = (
                        torch.tensor(patch, dtype=torch.float32)
                        .permute(2, 0, 1)
                        .unsqueeze(0)
                        .to(self.device)
                    )
                    out = model(t)
                    pred = torch.argmax(out, dim=1).squeeze().cpu().numpy()
                    pred_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += pred
                    count_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += 1

        count_map = np.maximum(count_map, 1)
        pred_map = (pred_map / count_map).astype(np.int64)

        # Smooth to reduce salt-and-pepper noise
        return self._smooth_predictions(pred_map)

    def _sliding_window_temporal(self, temporal_stack: np.ndarray) -> np.ndarray:
        """Patch-based prediction for temporal ConvLSTM model."""
        T, H, W, C = temporal_stack.shape
        pred_map = np.zeros((H, W), dtype=np.float32)
        count_map = np.zeros((H, W), dtype=np.float32)

        self.convlstm.eval()
        with torch.no_grad():
            for i in range(0, H - PATCH_SIZE, STRIDE):
                for j in range(0, W - PATCH_SIZE, STRIDE):
                    patch = temporal_stack[
                        :, i : i + PATCH_SIZE, j : j + PATCH_SIZE, :
                    ]
                    if patch.shape[1:3] != (PATCH_SIZE, PATCH_SIZE):
                        continue

                    # (T, H, W, C) → (1, T, C, H, W)
                    t = (
                        torch.tensor(patch.transpose(0, 3, 1, 2), dtype=torch.float32)
                        .unsqueeze(0)
                        .to(self.device)
                    )
                    out = self.convlstm(t)
                    pred = (
                        torch.argmax(out, dim=1).squeeze().cpu().numpy().astype(float)
                    )
                    pred_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += pred
                    count_map[i : i + PATCH_SIZE, j : j + PATCH_SIZE] += 1

        count_map = np.maximum(count_map, 1)
        pred_map = (pred_map / count_map).astype(np.int64)
        return self._smooth_predictions(pred_map)

    @staticmethod
    def _smooth_predictions(pred_map: np.ndarray, window: int = 5) -> np.ndarray:
        """Majority vote smoothing to reduce noise."""
        smoothed = np.zeros_like(pred_map)
        for cls in range(NUM_CLASSES):
            binary = (pred_map == cls).astype(float)
            smoothed_binary = ndimage.uniform_filter(binary, size=window)
            smoothed[smoothed_binary > 0.3] = cls
        return smoothed

    def generate_explanation(self, features: np.ndarray) -> str:
        """
        Generate a Grad-CAM explanation heatmap for the UNetV3 model.

        This runs AFTER prediction — it does NOT modify the prediction pipeline.
        Uses a single centre patch from the feature array (fast, representative).

        Args:
            features: (H, W, 12) feature array — same input as predict_static

        Returns:
            base64-encoded PNG string of the JET-coloured heatmap,
            or "" if Grad-CAM fails (prediction is never affected).
        """
        try:
            from .explainability import generate_gradcam, encode_heatmap

            H, W, C = features.shape
            # Pick a representative centre patch
            ci = max(0, H // 2 - PATCH_SIZE // 2)
            cj = max(0, W // 2 - PATCH_SIZE // 2)
            patch = features[ci: ci + PATCH_SIZE, cj: cj + PATCH_SIZE, :]
            if patch.shape[:2] != (PATCH_SIZE, PATCH_SIZE):
                patch = np.pad(
                    patch,
                    [(0, PATCH_SIZE - patch.shape[0]),
                     (0, PATCH_SIZE - patch.shape[1]),
                     (0, 0)],
                )

            # (H, W, C) → (1, C, H, W)
            t = (
                torch.tensor(patch, dtype=torch.float32)
                .permute(2, 0, 1)
                .unsqueeze(0)
                .to(self.device)
            )

            # 1) Run prediction on the same patch (separate, no pipeline change)
            #    to get a mask of where environmental change was detected.
            with torch.no_grad():
                out = self.unet(t)
                pred = torch.argmax(out, dim=1).squeeze()  # (H, W)
            # Mask: 1.0 where the model predicts change (class != 0), 0 otherwise
            prediction_mask = (pred != 0).float().cpu().numpy()  # (H, W)

            # 2) Generate Grad-CAM — requires grad, so use a fresh tensor
            t_grad = t.detach().clone().requires_grad_(True)

            # Target the last encoder block of UNetV3
            target_layer = getattr(self.unet, "enc4", None) \
                        or getattr(self.unet, "encoder4", None) \
                        or list(self.unet.children())[-2]

            heatmap = generate_gradcam(self.unet, t_grad, target_layer)

            # 3) Mask the heatmap: only show explanations in change regions
            if heatmap is not None:
                heatmap = heatmap * prediction_mask
                # Re-normalise to [0, 1] after masking
                hmax = heatmap.max()
                if hmax > 0:
                    heatmap = heatmap / hmax

            return encode_heatmap(heatmap)

        except Exception as exc:
            import logging
            logging.getLogger(__name__).warning(
                "generate_explanation failed (prediction unaffected): %s", exc
            )
            return ""

