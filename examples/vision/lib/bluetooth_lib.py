import threading
import time
import asyncio
from bleak import BleakClient

UART_SERVICE_UUID = "6E400001-B5A3-F393-E0A9-E50E24DCCA9E"
UART_RX_UUID = "6E400002-B5A3-F393-E0A9-E50E24DCCA9E"
UART_TX_UUID = "6E400003-B5A3-F393-E0A9-E50E24DCCA9E"


class BLEUARTBridge:
    def __init__(self, address):
        self.address = address
        self.client = BleakClient(address)
        self.connected = False
        self.connection_event = threading.Event()
        self.loop = asyncio.new_event_loop()
        self.thread = threading.Thread(target=self._run_event_loop)
        self.thread.start()
        
        # Start connection automatically upon initialization
        self._auto_connect()

    def _run_event_loop(self):
        asyncio.set_event_loop(self.loop)
        self.loop.run_forever()

    def _auto_connect(self):
        # Schedule the connect coroutine in the event loop
        asyncio.run_coroutine_threadsafe(self._connect(), self.loop).result()

    async def _connect(self):
        try:
            await self.client.connect(timeout=60)
            self.connected = True
            self.connection_event.set()
            print(f"Connected to {self.address}")
            await self.client.start_notify(UART_TX_UUID, self._notification_handler)
        except Exception as e:
            print(f"Failed to connect: {e}")
            self.disconnect()

    def send(self, data):
        if self.connection_event.wait(timeout=10):
            future = asyncio.run_coroutine_threadsafe(
                self.client.write_gatt_char(UART_RX_UUID, data.encode(), response=True),
                self.loop
            )
            try:
                future.result()
                print(f"Sent: {data}")
            except Exception as e:
                print(f"Failed to send data: {e}")
        else:
            print("Unable to send data: Not connected.")

    def disconnect(self):
        if self.connected:
            future_stop_notify = asyncio.run_coroutine_threadsafe(self.client.stop_notify(UART_TX_UUID), self.loop)
            future_disconnect = asyncio.run_coroutine_threadsafe(self.client.disconnect(), self.loop)
            try:
                future_stop_notify.result()
                future_disconnect.result()
                print(f"Disconnected from {self.address}")
            except Exception as e:
                print(f"Disconnection error: {e}")
            finally:
                self.connected = False
                self.connection_event.clear()
        self.loop.stop()  # Stop the event loop

    def _notification_handler(self, sender, data):
        print(data.decode(), end="")


# Factory function to initialize the BLEUARTBridge instance
def init(address):
    return BLEUARTBridge(address)
