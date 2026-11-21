# PhaseWeave apps

The four editions have separate ZIPs and launch entry points. The local desktop editions require Python 3.10 or later and a browser. Extract the entire archive. On macOS open the included unsigned app bundle or run the terminal launcher. On Windows use the CMD launcher. On Linux run the supplied shell launcher. Read each package’s START-HERE.md for exact commands.

| Edition | Desktop start | Main function |
| --- | --- | --- |
| Explorer | http://127.0.0.1:8161/live-widgets.html | Gate spot and perpetual data and ECB FX reference observations |
| Research | http://127.0.0.1:8162/forecast-app.html | Trained model inference in the embedded Hugging Face Space |
| Paper Desk | http://127.0.0.1:8163/desk.html | Local paper execution and session export |
| Professional Workbench | http://127.0.0.1:8164/workbench.html | Paper desk with optional connector status and links |

[Downloads and SHA-256 sums](https://github.com/amelie-iska/phaseweave-lab/releases/tag/apps-v1)

## Explorer

Open the [browser Explorer](https://amelie-iska.github.io/phaseweave-lab/live-widgets.html). To add an app icon on a supported device, use the install control or the browser's home-screen action. Choose a market and connect feeds. Each panel records its own observation or release time.

## Research

Use the FX replay tab to choose a forecast preset, checkpoint and compute backend. The app connects to Hugging Face and leaves weights and samples under their existing access terms. A network connection is needed. Use the Live spot tab for current spot-quote observation and the Reference forecast tab for exported input windows. [Hosted Research app](https://amelie-iska.github.io/phaseweave-lab/forecast-app.html)

## Paper Desk

Paper Desk starts disconnected and disarmed. Connect feeds to observe prices. Arm paper cycles only when you want virtual fills. Export a session from the dashboard to retain the paper ledger. The package omits external bot connector code.

## Professional Workbench

Workbench starts with connectors disabled. Edit the package's local connector profile as described in START-HERE.md to enable specific loopback status endpoints. The connectors query read-only status APIs and provide links to the tools' own dashboards. Paper controls are available in the same workspace. [Commercial terms](https://github.com/amelie-iska/phaseweave-lab/blob/main/COMMERCIAL.md)
