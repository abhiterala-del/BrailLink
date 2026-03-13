#!/usr/bin/env python3
"""Drives the BraiLink embosser.

Rewritten for the reference wiring in hardware/electronics/wiring.md. Each line
of a job is one printed line; each cell is six digits ("1" = punch) in the
order the print server sends them (see DIGIT_TO_DOT).

Printing:
    completetest.py JOB_FILE            print the job
    completetest.py --check JOB_FILE    validate the job and check the printer is free
    completetest.py --dry-run JOB_FILE  show every move without touching hardware

Calibration and assembly (see pi/README.md):
    completetest.py --rest              move every servo to its rest angle
    completetest.py --test-dot N        punch only dot N (1-6)
    completetest.py --home              move the head to the home switch
    completetest.py --jog-head MM       move the head MM millimeters (negative = toward home)
    completetest.py --jog-feed MM       feed the paper MM millimeters (negative = backward)
"""

import argparse
import fcntl
import math
import os
import signal
import sys
import time

# ===========================================================================
# CALIBRATION
# Every value marked CALIBRATE needs checking on your printer. pi/README.md
# walks through them in order, with the test command for each.
# ===========================================================================

# --- Stepper motors and drivers -------------------------------------------

# CALIBRATE: full steps per motor revolution. 200 for 1.8° motors (most NEMA 17),
# 400 for 0.9° motors. Printed on the motor's label or datasheet.
MOTOR_STEPS_PER_REV = 200

# CALIBRATE: microstepping set on the drivers' MS1-MS3 pins. A4988 and DRV8825
# boards with nothing connected to MS1-MS3 run full steps (1). Higher values are
# smoother and quieter but slower, because this script steps in software.
HEAD_MICROSTEPS = 1
FEED_MICROSTEPS = 1

# CALIBRATE: seconds per step. Smaller is faster. Raise it if a motor stalls,
# buzzes without turning, or the head ends up in the wrong place (skipped steps).
STEP_SECONDS = 0.002

# CALIBRATE: flip these if a motor turns the wrong way. (Swapping one coil's two
# wires with the power off does the same thing.)
FEED_FORWARD_IS_HIGH = True
HEAD_AWAY_FROM_HOME_IS_HIGH = True

# --- Punch head travel (lead screw) ---------------------------------------

# CALIBRATE: how far the head moves per turn of the lead screw. The CAD uses an
# 8 mm lead. A screw sold as "T8 lead 8 mm" moves 8 mm per turn; "T8 lead 2 mm"
# moves 2 mm. Check with --jog-head.
LEAD_SCREW_LEAD_MM = 8.0

# CALIBRATE: distance between neighbouring cells. In the CAD the die blocks are
# 12.7 mm apart, so each cell needs 12.7 mm of head travel.
CELL_PITCH_MM = 12.7

# CALIBRATE: distance from where the head stops after homing to the first die.
# Home the head, then jog it until the punches sit over the first die and add
# up the jogs.
HOME_TO_FIRST_CELL_MM = 0.0

# CALIBRATE: the furthest the head can travel, roughly the usable rail length
# (the rails are 250 mm). Homing gives up after this distance.
HEAD_TRAVEL_MM = 250.0

# How far to back off the home switch after touching it, so it isn't held pressed.
HOMING_BACKOFF_MM = 1.0

# --- Paper feed (friction wheels) -----------------------------------------

# CALIBRATE: outside diameter of a friction wheel with its O-ring fitted. The
# printed wheel is 25.6 mm without the O-ring, so the real value is larger.
# Measure it, then fine-tune: feed 100 mm with --jog-feed, measure how far the
# paper actually moved, and multiply this value by (measured / 100).
FEED_ROLLER_DIAMETER_MM = 25.6

# CALIBRATE: paper movement between braille lines. Standard braille lines are
# about 10 mm apart.
LINE_PITCH_MM = 10.0

# CALIBRATE: paper fed before the first line (top margin) and after the last
# line (to push the page out). 0 means none.
TOP_MARGIN_MM = 0.0
EJECT_MM = 0.0

# --- Servos (MG995) -------------------------------------------------------

# CALIBRATE: servo pulse widths, in microseconds, for 0° and 180°. MG995s
# usually need about 500-2500. If a servo covers much less than half a turn
# across 0-180°, widen the range; if it strains or buzzes at either end, narrow it.
SERVO_PULSE_RANGE_US = (500, 2500)

# CALIBRATE: angle for each dot's servo with its punch fully raised. Run --rest
# before fitting the gears and racks, so they mesh with the servos at this angle.
SERVO_REST_ANGLE = {1: 90, 2: 90, 3: 90, 4: 90, 5: 90, 6: 90}

# CALIBRATE: angle for each dot's servo with its punch pressed into the die.
# The 15-tooth gear moves its rack about 0.22 mm per degree, so 45° of turn
# (90 → 45) is about 10 mm of punch travel. If the two head halves are mirror
# images, the servos on one side turn the other way: set those dots to rest
# plus the travel instead (for example 135). Check each with --test-dot.
SERVO_PUNCH_ANGLE = {1: 45, 2: 45, 3: 45, 4: 45, 5: 45, 6: 45}

# CALIBRATE: seconds to hold a punch down. Raise it if dots come out faint.
# An MG995 needs about 0.15 s to turn 45°.
SERVO_PUNCH_SECONDS = 0.25

# CALIBRATE: seconds to wait for the punches to lift before the head moves.
# Raise it if the paper drags or tears.
SERVO_RETURN_SECONDS = 0.25

# CALIBRATE: which PCA9685 channel each dot's servo is plugged into. Run
# --test-dot 1 to 6; the punch that moves should be that dot (1-3 down the left
# column, 4-6 down the right).
DOT_TO_CHANNEL = {1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5}

# --- Reading side ---------------------------------------------------------

# CALIBRATE: dots are raised on the side of the paper facing the dies, which is
# the opposite side from the punches. If you read from that side, braille must
# be printed mirror-image. Print the letter "b" (dots 1 and 2, the left column)
# and read it from the raised side: if the two dots are in the right column,
# set this to True.
MIRROR = False

# ===========================================================================
# Wiring (BCM GPIO numbers), matching hardware/electronics/wiring.md.
# Change these only if your wiring differs.
# ===========================================================================

FEED_STEP_PIN, FEED_DIR_PIN = 17, 27
HEAD_STEP_PIN, HEAD_DIR_PIN = 22, 23
ENABLE_PIN = 24  # active low, shared by all drivers
HOME_SWITCH_PIN = 25  # to GND, uses the internal pull-up

# ===========================================================================
# Fixed by the print server; change only together with shared/braille.ts.
# ===========================================================================

# The print server sends each cell's digits in dot order 3, 2, 1, 6, 5, 4.
DIGIT_TO_DOT = (3, 2, 1, 6, 5, 4)
CELLS_PER_LINE = 14  # CHARS_PER_LINE in shared/braille.ts
MAX_LINES = 10  # MAX_LINES in shared/braille.ts

LOCK_FILE = "/tmp/brailink-print.lock"
MIRRORED_DOT = {1: 4, 2: 5, 3: 6, 4: 1, 5: 2, 6: 3}

HEAD_STEPS_PER_MM = MOTOR_STEPS_PER_REV * HEAD_MICROSTEPS / LEAD_SCREW_LEAD_MM
FEED_STEPS_PER_MM = MOTOR_STEPS_PER_REV * FEED_MICROSTEPS / (math.pi * FEED_ROLLER_DIAMETER_MM)


class JobError(Exception):
    pass


def check_calibration():
    last_cell_mm = HOME_TO_FIRST_CELL_MM + (CELLS_PER_LINE - 1) * CELL_PITCH_MM
    if last_cell_mm > HEAD_TRAVEL_MM:
        raise JobError(
            f"A full line needs {last_cell_mm:.1f} mm of head travel but HEAD_TRAVEL_MM is {HEAD_TRAVEL_MM} mm"
        )


def parse_job(text):
    """Returns a list of lines; each line is a list of sets of dots to punch."""
    lines = text.rstrip("\n").split("\n") if text.strip() else []
    if len(lines) > MAX_LINES:
        raise JobError(f"Job has {len(lines)} lines; the maximum is {MAX_LINES}")
    job = []
    for number, line in enumerate(lines, start=1):
        cells = line.split()
        if len(cells) > CELLS_PER_LINE:
            raise JobError(f"Line {number} has {len(cells)} cells; the maximum is {CELLS_PER_LINE}")
        parsed = []
        for cell in cells:
            if len(cell) != 6 or set(cell) - {"0", "1"}:
                raise JobError(f"Line {number} has an invalid cell: {cell!r}")
            parsed.append({DIGIT_TO_DOT[i] for i, digit in enumerate(cell) if digit == "1"})
        job.append(parsed)
    if not job:
        raise JobError("Job is empty")
    return job


def acquire_lock():
    """Holds an exclusive lock for the life of the process; fails if another print is running."""
    handle = open(LOCK_FILE, "w")
    try:
        fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        raise JobError("Printer is busy")
    return handle


class DryRunHardware:
    """Prints each move instead of making it."""

    def __init__(self):
        self.head_mm = 0.0

    def enable(self, on):
        print(f"motors {'on' if on else 'off'}")

    def home_head(self):
        print("home head")
        self.head_mm = 0.0

    def move_head_to(self, mm):
        steps = round(mm * HEAD_STEPS_PER_MM) - round(self.head_mm * HEAD_STEPS_PER_MM)
        print(f"head to {mm:.2f} mm ({steps:+d} steps)")
        self.head_mm = mm

    def feed(self, mm):
        if mm:
            print(f"feed paper {mm:.2f} mm (~{round(mm * FEED_STEPS_PER_MM)} steps)")

    def punch(self, dots):
        print(f"punch dots {sorted(dots)}")

    def rest_servos(self):
        print("servos to rest")

    def close(self, relax_servos=True):
        if relax_servos:
            print("servos relaxed")


class Hardware:
    def __init__(self):
        # Imported here so --check and --dry-run work on any computer.
        from adafruit_servokit import ServoKit
        from gpiozero import Button, OutputDevice

        self.kit = ServoKit(channels=16)
        for channel in DOT_TO_CHANNEL.values():
            self.kit.servo[channel].set_pulse_width_range(*SERVO_PULSE_RANGE_US)
        self.feed_step = OutputDevice(FEED_STEP_PIN)
        self.feed_dir = OutputDevice(FEED_DIR_PIN)
        self.head_step = OutputDevice(HEAD_STEP_PIN)
        self.head_dir = OutputDevice(HEAD_DIR_PIN)
        self.enable_pin = OutputDevice(ENABLE_PIN, active_high=False, initial_value=False)
        self.home_switch = Button(HOME_SWITCH_PIN, pull_up=True)
        # Head position in steps from home; None until homed.
        self.head_steps = None
        # Fractional feed steps carried between moves, so rounding never adds up.
        self.feed_remainder = 0.0

    def enable(self, on):
        self.enable_pin.value = on
        if on:
            time.sleep(0.01)

    @staticmethod
    def _pulse(step_pin, dir_pin, steps, high, stop_when=None):
        dir_pin.value = high
        time.sleep(0.001)  # drivers need the direction set before the first step
        for taken in range(steps):
            if stop_when and stop_when():
                return taken
            step_pin.on()
            time.sleep(STEP_SECONDS / 2)
            step_pin.off()
            time.sleep(STEP_SECONDS / 2)
        return steps

    def home_head(self):
        limit = round(HEAD_TRAVEL_MM * 1.1 * HEAD_STEPS_PER_MM)
        taken = self._pulse(
            self.head_step, self.head_dir, limit, not HEAD_AWAY_FROM_HOME_IS_HIGH,
            stop_when=lambda: self.home_switch.is_pressed,
        )
        if taken == limit and not self.home_switch.is_pressed:
            raise RuntimeError(
                "Home switch not reached; check the switch wiring and HEAD_AWAY_FROM_HOME_IS_HIGH"
            )
        self._pulse(self.head_step, self.head_dir, round(HOMING_BACKOFF_MM * HEAD_STEPS_PER_MM),
                    HEAD_AWAY_FROM_HOME_IS_HIGH)
        self.head_steps = 0

    def move_head_to(self, mm):
        if self.head_steps is None:
            raise RuntimeError("Head must be homed before moving to a position")
        target = round(mm * HEAD_STEPS_PER_MM)
        delta = target - self.head_steps
        self._pulse(self.head_step, self.head_dir, abs(delta),
                    HEAD_AWAY_FROM_HOME_IS_HIGH if delta > 0 else not HEAD_AWAY_FROM_HOME_IS_HIGH)
        self.head_steps = target

    def jog_head(self, mm):
        steps = round(mm * HEAD_STEPS_PER_MM)
        self._pulse(self.head_step, self.head_dir, abs(steps),
                    HEAD_AWAY_FROM_HOME_IS_HIGH if steps > 0 else not HEAD_AWAY_FROM_HOME_IS_HIGH)
        if self.head_steps is not None:
            self.head_steps += steps

    def feed(self, mm):
        exact = mm * FEED_STEPS_PER_MM + self.feed_remainder
        steps = round(exact)
        self.feed_remainder = exact - steps
        self._pulse(self.feed_step, self.feed_dir, abs(steps),
                    FEED_FORWARD_IS_HIGH if steps > 0 else not FEED_FORWARD_IS_HIGH)

    def punch(self, dots):
        for dot in dots:
            self.kit.servo[DOT_TO_CHANNEL[dot]].angle = SERVO_PUNCH_ANGLE[dot]
        time.sleep(SERVO_PUNCH_SECONDS)
        self.rest_servos()

    def rest_servos(self):
        for dot, channel in DOT_TO_CHANNEL.items():
            self.kit.servo[channel].angle = SERVO_REST_ANGLE[dot]
        time.sleep(SERVO_RETURN_SECONDS)

    def close(self, relax_servos=True):
        # Stop driving the servos so they don't buzz and draw current while idle.
        # The PCA9685 keeps holding the last angle after this script exits otherwise.
        if relax_servos:
            for channel in DOT_TO_CHANNEL.values():
                self.kit.servo[channel].angle = None
        for device in (self.feed_step, self.feed_dir, self.head_step, self.head_dir,
                       self.enable_pin, self.home_switch):
            device.close()


def cells_to_punch(line):
    """Yields (cell position, dots) for each non-blank cell, in head travel order."""
    cells = []
    for index, dots in enumerate(line):
        if not dots:
            continue
        if MIRROR:
            cells.append((CELLS_PER_LINE - 1 - index, {MIRRORED_DOT[dot] for dot in dots}))
        else:
            cells.append((index, dots))
    return sorted(cells, key=lambda cell: cell[0])


def print_job(job, hw):
    hw.rest_servos()
    hw.enable(True)
    hw.feed(TOP_MARGIN_MM)
    for number, line in enumerate(job, start=1):
        print(f"line {number}/{len(job)}", flush=True)
        cells = cells_to_punch(line)
        if cells:
            # Homing every line corrects any steps the head motor skipped.
            hw.home_head()
            for position, dots in cells:
                hw.move_head_to(HOME_TO_FIRST_CELL_MM + position * CELL_PITCH_MM)
                hw.punch(dots)
        hw.feed(LINE_PITCH_MM)
    hw.feed(EJECT_MM)
    hw.home_head()


def run_tool(args, hw):
    """The calibration and assembly commands."""
    if args.rest:
        hw.rest_servos()
        print("All servos at rest. Fit the gears and racks now.")
    elif args.test_dot:
        hw.rest_servos()
        hw.punch({args.test_dot})
        print(f"Punched dot {args.test_dot} on PCA9685 channel {DOT_TO_CHANNEL[args.test_dot]}")
    elif args.home:
        hw.enable(True)
        hw.home_head()
        print("Head homed")
    elif args.jog_head is not None:
        hw.enable(True)
        hw.jog_head(args.jog_head)
        print(f"Head moved {args.jog_head} mm")
    elif args.jog_feed is not None:
        hw.enable(True)
        hw.feed(args.jog_feed)
        print(f"Paper fed {args.jog_feed} mm")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--check", action="store_true", help="validate the job and check the printer is free")
    mode.add_argument("--dry-run", action="store_true", help="show every move without touching hardware")
    mode.add_argument("--rest", action="store_true", help="move every servo to its rest angle")
    mode.add_argument("--test-dot", type=int, choices=range(1, 7), metavar="N", help="punch only dot N (1-6)")
    mode.add_argument("--home", action="store_true", help="move the head to the home switch")
    mode.add_argument("--jog-head", type=float, metavar="MM", help="move the head MM millimeters")
    mode.add_argument("--jog-feed", type=float, metavar="MM", help="feed the paper MM millimeters")
    parser.add_argument("job_file", nargs="?")
    args = parser.parse_args()
    is_tool = args.rest or args.test_dot or args.home or args.jog_head is not None or args.jog_feed is not None
    if not is_tool and not args.job_file:
        parser.error("a job file is required")

    try:
        check_calibration()
        job = None
        if not is_tool:
            with open(args.job_file) as f:
                job = parse_job(f.read())
        if args.dry_run:
            hw = DryRunHardware()
            print_job(job, hw)
            hw.close()
            return 0
        lock = acquire_lock()
        if args.check:
            lock.close()
            return 0
    except (JobError, OSError) as error:
        print(f"Error: {error}", file=sys.stderr)
        return 1

    # "Stop Printing" sends SIGTERM; turn it into a normal exit so cleanup runs.
    signal.signal(signal.SIGTERM, lambda *_: sys.exit("Stopped"))
    hw = None
    try:
        hw = Hardware()
        if is_tool:
            run_tool(args, hw)
        else:
            print_job(job, hw)
            print("Done", flush=True)
        return 0
    finally:
        if hw:
            if not args.rest:
                hw.rest_servos()
            hw.enable(False)
            # --rest keeps the servos holding their rest angle for fitting gears.
            hw.close(relax_servos=not args.rest)
        # Temporary jobs from receive_text.sh are removed once printed.
        if args.job_file and os.path.basename(args.job_file).startswith("brailink-job."):
            os.remove(args.job_file)


if __name__ == "__main__":
    sys.exit(main())
