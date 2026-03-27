#include <Arduino.h>

#ifndef LED_BUILTIN
#define LED_BUILTIN 8
#endif

/*
  Seeed Studio XIAO ESP32C3
  - Logs a line every 1 second
  - Logs when the BOOT button is pressed
  - Flashes the built-in LED on each 1-second log
  - Flashes the built-in LED when the BOOT button is pressed
  - Uses software debouncing
  - Uses non-blocking LED flashes

  Notes:
  - RESET button cannot be detected in user code because it resets the MCU.
  - This sketch assumes the BOOT button is on GPIO9.
  - On many XIAO boards the built-in LED is active LOW:
      LOW  = LED on
      HIGH = LED off
*/

const int BUTTON_PIN = 9; // BOOT button
const int LED_PIN = LED_BUILTIN;

const unsigned long LOG_INTERVAL_MS = 1000;
const unsigned long DEBOUNCE_MS = 30;
const unsigned long FLASH_MS = 80;

// Heartbeat timing
unsigned long lastHeartbeatMs = 0;

// Debounce state
bool lastRawButtonReading = HIGH;
bool debouncedButtonState = HIGH;
unsigned long lastDebounceChangeMs = 0;

// LED flash state
bool ledFlashing = false;
unsigned long ledFlashStartMs = 0;

void setLed(bool on)
{
  // Active LOW LED
  digitalWrite(LED_PIN, on ? LOW : HIGH);
}

void startLedFlash(unsigned long nowMs)
{
  ledFlashing = true;
  ledFlashStartMs = nowMs;
  setLed(true);
}

void updateLedFlash(unsigned long nowMs)
{
  if (ledFlashing && (nowMs - ledFlashStartMs >= FLASH_MS))
  {
    ledFlashing = false;
    setLed(false);
  }
}

void setup()
{
  Serial.begin(115200);

  pinMode(LED_PIN, OUTPUT);
  setLed(false);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  delay(200);
  Serial.println();
  Serial.println("XIAO ESP32C3 logger starting...");
  Serial.println("Heartbeat every 1 second, BOOT button press logging enabled.");
}

void loop()
{
  unsigned long now = millis();

  // --- 1 second heartbeat ---
  if (now - lastHeartbeatMs >= LOG_INTERVAL_MS)
  {
    lastHeartbeatMs = now;
    Serial.printf("[%lu ms] heartbeat\n", now);
    startLedFlash(now);
  }

  // --- Read raw button state ---
  bool rawReading = digitalRead(BUTTON_PIN);

  // If raw reading changed, restart debounce timer
  if (rawReading != lastRawButtonReading)
  {
    lastDebounceChangeMs = now;
    lastRawButtonReading = rawReading;
  }

  // If raw reading has stayed stable long enough, accept it
  if ((now - lastDebounceChangeMs) >= DEBOUNCE_MS)
  {
    if (debouncedButtonState != rawReading)
    {
      debouncedButtonState = rawReading;

      // Detect press event: HIGH -> LOW
      if (debouncedButtonState == LOW)
      {
        Serial.printf("[%lu ms] BOOT button pressed\n", now);
        startLedFlash(now);
      }
    }
  }

  // --- Update non-blocking LED flash ---
  updateLedFlash(now);
}