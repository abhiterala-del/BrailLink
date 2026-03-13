# Hardware

Everything needed to build the BraiLink embosser. Copyright 2026 Sounak Bagchi, Priyam Kabra, Aditya Kirubakaran and Abhi Terala. The hardware design files are licensed under the [CERN Open Hardware Licence v2 – Permissive](LICENSE) (CERN-OHL-P-2.0).

## CAD

- **[v1.0 design](https://cad.onshape.com/documents/ed4f849869adc5ba36dcaea4/v/76137460dc02ea32acab218b/e/485b0c6c41fe1b8932338247)**: the frozen version that matches this release. Build from this one.
- **[Latest design](https://cad.onshape.com/documents/ed4f849869adc5ba36dcaea4/w/7887032d5b981c2bf00f56f3/e/6402decc65e6898c3c617482)**: the live workspace, which may include unreleased changes.

The Onshape document has every part and the full assembly. It opens in a browser; a free Onshape account lets you copy it and make your own changes.

All the parts are in the CAD. The only parts you need to buy are listed in [`BOM.csv`](BOM.csv): the electronics, plus linear rails, a lead screw, shaft couplers and rubber O-rings.

You need a 3D printer, or a printing service to order the parts from. Exact models of the bought parts don't matter as long as the sizes match the CAD; we bought ours from McMaster-Carr and Amazon.

| Path | Contents |
|---|---|
| `BOM.csv` | Parts to buy, with supplier links |
| `cad/stl/` | 22 print-ready parts, with a [print list](cad/stl/README.md) giving quantities and sizes |
| `cad/step/` | [`brailink-full-assembly.step`](cad/step/brailink-full-assembly.step): the full assembly, for any CAD tool |
| `electronics/` | [Wiring diagram and pinout](electronics/wiring.md) (reference design) |

### Exporting from Onshape

When you tag a release, export the current design into this folder so the files match that version of the code, and so builders can download them without an Onshape account:

- **STL:** right-click each part in the part list → *Export* → STL, into `cad/stl/`.
- **STEP:** right-click the assembly tab → *Export* → STEP, into `cad/step/`.

## How printing works

The print server ([`print-server/`](../print-server)) converts text to braille cells and pipes them over SSH to `~/receive_text.sh` on the Pi, which starts [`completetest.py`](../pi) to drive the motors. Each line of input is one printed line; each cell is a 6-digit dot pattern, separated by spaces. "Stop Printing" sends `SIGTERM` to `completetest.py`.
