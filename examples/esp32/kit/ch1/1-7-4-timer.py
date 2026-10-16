from machine import Pin, Timer

led = Pin(2, Pin.OUT)

def toggle_led(timer):
    led.value(not led.value())

timer0 = Timer(0)
timer0.init(period=500, mode=Timer.PERIODIC,
            callback=toggle_led)
