# Printed parts

One STL per part, exported from the [Onshape design](../../README.md#cad) at fine resolution. The number at the end of each file name is how many copies one printer needs: print `PRINT_02_Die_Block_qty17.stl` 17 times, for example. 22 files, 61 printed parts in total.

Files are in millimeters; import them at 100% scale. They're raw exports, so choose orientation, supports and material in your slicer.

| # | Part | Qty | Size (mm) |
|---|---|---|---|
| 01 | Base plate | 1 | 325 × 152 × 10 |
| 02 | Die block | 17 | 20.3 × 12.7 × 9 |
| 03 | Wall A | 1 | 152 × 38 × 10 |
| 04 | Wall B | 1 | 152 × 38 × 10 |
| 06 | Side clip | 5 | 30 × 10 × 9 |
| 07 | Other-side motor mount, part 1 | 1 | 83 × 72 × 47 |
| 08 | Other-side motor mount, part 2 | 1 | 83 × 72 × 47 |
| 09 | Side bearing clip | 1 | 29 × 19 × 9 |
| 10 | Side motor holder | 1 | 61 × 47 × 42 |
| 11 | Paper alignment clip, part 1 | 1 | 42 × 34 × 18 |
| 12 | Paper alignment clip, part 2 | 1 | 42 × 34 × 18 |
| 13 | Head nut bracket, first end | 1 | 85 × 45 × 6 |
| 14 | Head nut bracket, other end | 1 | 85 × 45 × 6 |
| 15 | Paper advance shaft, part 1 | 2 | 30 × 6 × 5 |
| 16 | Shaft spacer | 2 | 7 × 7 × 7 |
| 17 | Friction wheel (O-ring goes around it) | 2 | 25.6 dia. × 10 |
| 18 | Paper advance shaft, part 2 | 2 | 20 × 11 × 10 |
| 19 | Punch spur gear, 15 teeth | 6 | 29 dia. × 4.5 |
| 20 | Punch head case | 2 | 150 × 110 × 38 |
| 21 | Punch | 6 | 26 × 2.75 × 2.75 |
| 22 | Rack, 110 mm | 4 | 110 × 9 × 5 |
| 23 | Rack, 150 mm | 2 | 150 × 9 × 5 |

## Notes

- **Build volume:** the base plate is 325 mm long. Check that it fits your printer, or have it printed by a service.
- **Strength:** the punches, racks, gears and shafts carry the load. Print them solid, or close to it.
- **Part 05** is the steel rod that locks the die blocks in place, so it's bought rather than printed; it's in the [BOM](../../BOM.csv).
