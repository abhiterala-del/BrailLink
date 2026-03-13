# Raspberry Pi scripts

These run on the Raspberry Pi and drive the embosser.

| File | What it does |
|---|---|
| `receive_text.sh` | Receives a print job from the print server over SSH, checks it, and starts printing in the background |
| `completetest.py` | Moves the motors and servos to print the job. "Stop Printing" ends it with `SIGTERM`, which returns the servos to rest and switches the motors off |

> These scripts are a rewrite for the [reference wiring](../hardware/electronics/wiring.md). If your wiring differs, change the pin numbers near the top of `completetest.py`.

## Setup

1. **Install Raspberry Pi OS** (Bookworm or newer) with Raspberry Pi Imager. In the imager's settings, set a username and turn on SSH.
2. **Turn on I²C** for the servo board: run `sudo raspi-config`, then go to *Interface Options* → *I2C* → *Enable*.
3. **Copy the scripts** into the home folder of that user on the Pi:
   ```bash
   scp pi/receive_text.sh pi/completetest.py <user>@raspberrypi.local:~/
   ```
4. **Install the Python packages** on the Pi:
   ```bash
   python3 -m venv --system-site-packages ~/brailink-venv
   ~/brailink-venv/bin/pip install adafruit-circuitpython-servokit gpiozero
   ```
   `receive_text.sh` uses this environment automatically.
5. **Let the print server log in without a password.** On the computer that runs the print server:
   ```bash
   ssh-keygen -t ed25519            # skip if you already have a key
   ssh-copy-id <user>@raspberrypi.local
   ssh <user>@raspberrypi.local echo ok   # should print "ok" with no password prompt
   ```
   Then set `PI_USER`, `PI_HOST` and `PI_SSH_KEY` in that computer's `.env` to match.

## Calibration

Every value that depends on your build is in the **CALIBRATION** block at the top of `completetest.py`, marked `CALIBRATE` with an explanation. None of them have been checked on a real printer yet, so work through this list before the first print. Run each command from the Pi's home folder; `py` below is short for `~/brailink-venv/bin/python completetest.py`.

| Step | Command | Setting | Starting value | What to check |
|---|---|---|---|---|
| 1. Servo rest | `py --rest` | `SERVO_REST_ANGLE` | 90° | All servos move to rest. Do this **before** fitting the gears and racks, so the punches mesh fully raised. |
| 2. Servo range | `py --test-dot 1` | `SERVO_PULSE_RANGE_US` | 500–2500 µs | If 0–180° gives much less than half a turn, widen it; if a servo strains at the ends, narrow it. |
| 3. Which servo is which | `py --test-dot 1` … `6` | `DOT_TO_CHANNEL` | dot N → channel N−1 | The punch that moves is that dot: 1–3 down the left column, 4–6 down the right. |
| 4. Punch depth | `py --test-dot N` | `SERVO_PUNCH_ANGLE` | 45° | The punch goes cleanly into the die without jamming. About 0.22 mm of punch travel per degree. If one head half turns the other way, use rest **plus** travel for those dots (for example 135°). |
| 5. Punch timing | `py --test-dot N` | `SERVO_PUNCH_SECONDS`, `SERVO_RETURN_SECONDS` | 0.25 s each | Raise the first if dots are faint, the second if the paper drags when the head moves. |
| 6. Head direction | `py --home` | `HEAD_AWAY_FROM_HOME_IS_HIGH` | `True` | The head moves **toward** the home switch and stops on it. If it moves away, flip the setting (stop it with Ctrl+C). |
| 7. Head distance | `py --jog-head 100` | `LEAD_SCREW_LEAD_MM`, `HEAD_MICROSTEPS`, `MOTOR_STEPS_PER_REV` | 8 mm, 1, 200 | The head moves exactly 100 mm. If it's off by a whole factor (2×, 4×, 16×), the lead or the driver's microstep setting is wrong. |
| 8. First cell | `py --home`, then `py --jog-head …` | `HOME_TO_FIRST_CELL_MM` | 0 mm | Jog until the punches sit over the first die; enter the total distance. |
| 9. Cell spacing | dry run, then a test print | `CELL_PITCH_MM` | 12.7 mm (CAD) | Each cell lands on its own die. |
| 10. Head travel | — | `HEAD_TRAVEL_MM` | 250 mm | About the usable rail length; the script refuses to start if a full line wouldn't fit. |
| 11. Paper direction | `py --jog-feed 20` | `FEED_FORWARD_IS_HIGH` | `True` | Paper moves forward. |
| 12. Paper distance | `py --jog-feed 100` | `FEED_ROLLER_DIAMETER_MM` | 25.6 mm | Measure how far the paper moved, then multiply the setting by (measured ÷ 100). Measure the wheel **with** its O-ring first; the bare printed wheel is 25.6 mm. |
| 13. Line spacing and margins | test print | `LINE_PITCH_MM`, `TOP_MARGIN_MM`, `EJECT_MM` | 10, 0, 0 mm | Lines are evenly spaced, about 10 mm apart in standard braille. |
| 14. Speed | any move | `STEP_SECONDS`, `FEED_MICROSTEPS` | 0.002 s, 1 | Raise `STEP_SECONDS` if a motor stalls or skips. Microstepping makes the feed finer but every move slower. |
| 15. Reading side | print the letter "b" | `MIRROR` | `False` | Read it from the raised side: the two dots should be in the **left** column. If they're on the right, set `True`. |

Before printing for real, check what a job will do with `--dry-run`:

```bash
printf '001000 011000\n' > test.txt
~/brailink-venv/bin/python completetest.py --dry-run test.txt
```

Each print's progress and any errors are written to `~/brailink-print.log`.
