"""Fence violation polling service."""

import threading
import time

from app.core.database import get_mongo_collection
from app.utils.config_manager import get_fence_detection_interval
from app.utils.logger import get_logger

from .fence_service import DEVICE_COORD_QUERY, FenceService


logger = get_logger("FencePollingService")


class FencePollingService:
    """Periodically checks positioned devices against active fences."""

    def __init__(self):
        self.running = False
        self.thread = None
        self.fence_service = FenceService()
        self.devices_collection = get_mongo_collection("device")

    def start(self):
        if self.running:
            logger.warning("Fence polling service is already running")
            return

        self.running = True
        self.thread = threading.Thread(target=self._polling_loop, daemon=True)
        self.thread.start()
        logger.info("Fence polling service started")

    def stop(self):
        self.running = False
        if self.thread:
            self.thread.join(timeout=5)
        logger.info("Fence polling service stopped")

    def _polling_loop(self):
        while self.running:
            try:
                self._perform_detection()
                time.sleep(get_fence_detection_interval())
            except Exception as e:
                logger.error(f"Fence polling error: {e}")
                time.sleep(5)

    def _perform_detection(self):
        try:
            devices = list(self.devices_collection.find(DEVICE_COORD_QUERY))
            logger.debug(f"Polling {len(devices)} devices for fence violations")

            for device in devices:
                device_id = self.fence_service._device_identity(device)
                lat, lng = self.fence_service._get_device_lat_lng(device)
                if lat is None or lng is None:
                    continue

                try:
                    self.fence_service.check_fence_status(device_id, float(lat), float(lng))
                except Exception as e:
                    logger.error(f"Error checking fence status for device {device_id}: {e}")
        except Exception as e:
            logger.error(f"Failed to perform fence detection: {e}")


fence_polling_service = FencePollingService()
