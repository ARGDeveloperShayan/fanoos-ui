<!-- Improved compatibility of back to top link: See: https://github.com/othneildrew/Best-README-Template/pull/73 -->
<a id="readme-top"></a>
<!--
*** Thanks for checking out the Best-README-Template. If you have a suggestion
*** that would make this better, please fork the repo and create a pull request
*** or simply open an issue with the tag "enhancement".
*** Don't forget to give the project a star!
*** Thanks again! Now go create something AMAZING! :D
-->



<!-- PROJECT SHIELDS -->
<!--
*** I'm using markdown "reference style" links for readability.
*** Reference links are enclosed in brackets [ ] instead of parentheses ( ).
*** See the bottom of this document for the declaration of the reference variables
*** for contributors-url, forks-url, etc. This is an optional, concise syntax you may use.
*** https://www.markdownguide.org/basic-syntax/#reference-style-links
-->
[![Contributors][contributors-shield]][contributors-url]
[![Forks][forks-shield]][forks-url]
[![Stargazers][stars-shield]][stars-url]
[![Issues][issues-shield]][issues-url]
[![project_license][license-shield]][license-url]
[![LinkedIn][linkedin-shield]][linkedin-url]



<!-- PROJECT LOGO -->
<br />
<div align="center">
  <a href="https://github.com/ARGDeveloperShayan/fanoos-ui">
    <img src="assets/sprites/logo.svg" alt="Logo">
  </a>

<h3 align="center">Fanoos UI</h3>

  <p align="center">
    A local-first, privacy-respecting AI workbench for Ollama — agentic tools, deep reasoning, web search, voice, canvas, and a full admin panel. Your data never leaves your machine.
    <br />
    <a href="https://github.com/ARGDeveloperShayan/fanoos-ui"><strong>Explore the docs »</strong></a>
    <br />
    <br />
    <a href="https://github.com/ARGDeveloperShayan/fanoos-ui">View Demo</a>
    &middot;
    <a href="https://github.com/ARGDeveloperShayan/fanoos-ui/issues/new?labels=bug&template=bug-report---.md">Report Bug</a>
    &middot;
    <a href="https://github.com/ARGDeveloperShayan/fanoos-ui/issues/new?labels=enhancement&template=feature-request---.md">Request Feature</a>
  </p>
</div>



<!-- TABLE OF CONTENTS -->
<details>
  <summary>Table of Contents</summary>
  <ol>
    <li>
      <a href="#about-the-project">About The Project</a>
      <ul>
        <li><a href="#built-with">Built With</a></li>
      </ul>
    </li>
    <li>
      <a href="#getting-started">Getting Started</a>
      <ul>
        <li><a href="#prerequisites">Prerequisites</a></li>
        <li><a href="#installation">Installation</a></li>
      </ul>
    </li>
    <li><a href="#usage">Usage</a></li>
    <li><a href="#roadmap">Roadmap</a></li>
    <li><a href="#contributing">Contributing</a></li>
    <li><a href="#license">License</a></li>
    <li><a href="#contact">Contact</a></li>
    <li><a href="#acknowledgments">Acknowledgments</a></li>
  </ol>
</details>



<!-- ABOUT THE PROJECT -->
## About The Project

**Fanoos UI** ( _fanoos_ means “lantern” in Persian ) is a free, open‑source, self‑hosted chat interface that runs entirely on your own hardware through [Ollama](https://ollama.com). It is built for people who want the power of modern LLMs without sending a single byte to the cloud.

It is not just another chat wrapper. Fanoos ships with an agentic tool system (web search, calculator, weather, Wikipedia, unit conversion, dice, UUID, and more), a DeepThink mode that surfaces and times the model’s internal reasoning, a persistent memory layer, a live canvas editor, voice conversation, and a dedicated admin panel for pulling models, editing the system prompt, and inspecting server health.

Everything — chats, memories, settings, statistics — is stored in a single `data.json` file on your machine. The optional PHP backend adds server‑side persistence and bcrypt‑hashed admin authentication; the optional Python search server unlocks full web search and page reading.

### Highlights

- **100 % local inference** — no API keys, no accounts, no telemetry.
- **Agentic tool calling** — the model decides when to search, calculate, convert, or fetch weather.
- **DeepThink & effort control** — works with thinking‑capable models (DeepSeek‑R1, Qwen3) and lets you dial reasoning depth from low to high.
- **Search mode** — ground answers in live sources through the bundled DuckDuckGo / Bing search server, with citations as clickable Markdown links.
- **Persistent memory** — facts you share survive across chats; use `/remember` and `/forget` or let auto‑extraction handle it.
- **Canvas editor** — select a passage and let the model improve, grammar‑fix, summarize, or continue writing in place.
- **Voice mode** — push‑to‑talk conversation with speech recognition and text‑to‑speech.
- **Admin panel** — pull models with live layer‑by‑layer progress, create custom Modelfiles, unload running models, edit the global system prompt, and run a one‑shot test bench.
- **Multi‑device sync** — the PHP backend keys data by device, so your desktop and laptop can share the same server without overwriting each other.
- **Dark & light themes**, KaTeX math rendering, syntax‑highlighted code blocks, file attachments (text, PDF, images, audio), chat forking, folders, tags, and full JSON backup/restore.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



### Built With

* [![Ollama][ollama-badge]][ollama-url]
* [![JavaScript][js-badge]][js-url]
* [![HTML5][html-badge]][html-url]
* [![CSS3][css-badge]][css-url]
* [![PHP][php-badge]][php-url]
* [![Python][python-badge]][python-url]

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- GETTING STARTED -->
## Getting Started

Fanoos UI is a static frontend plus two optional local services. You can run it with nothing but Ollama and a browser, or add the PHP backend for server‑side storage and the Python server for full web search.

### Prerequisites

* **Ollama** — install it from [ollama.com](https://ollama.com) and make sure it is running.
  ```sh
  ollama serve
  ```
* **A modern browser** — Chrome, Edge, Firefox, or Safari.
* **PHP 8.0+** *(optional)* — enables server‑side `data.json` persistence and bcrypt admin passwords. Any standard PHP build works; no extensions beyond `json` are required.
* **Python 3.8+** *(optional)* — enables the full web search server (DuckDuckGo + Bing + page reading).
  ```sh
  python --version
  ```

### Installation

1. **Clone the repository**
   ```sh
   git clone https://github.com/ARGDeveloperShayan/fanoos-ui.git
   cd fanoos-ui
   ```

2. **Start Ollama** (if it is not already running)
   ```sh
   ollama serve
   ```
   Pull at least one model, for example:
   ```sh
   ollama pull llama3.2
   ```

3. **Serve the frontend** — use any static file server. PHP’s built‑in server is the simplest option because it also serves `api.php`:
   ```sh
   php -S 127.0.0.1:8080
   ```
   Then open [http://127.0.0.1:8080](http://127.0.0.1:8080).

   If you do not have PHP, you can use Python’s static server instead — everything except server‑side storage and bcrypt admin passwords will still work:
   ```sh
   python -m http.server 8080
   ```

4. **Start the search server** *(optional, recommended)*
   ```sh
   python search_server.py
   ```
   It listens on `http://127.0.0.1:8777`. The default URL is already pre‑filled in Settings; change it there if you use a different port.

5. **Open the app** and pick a model from the top bar. Chat. The first message will load the model into memory.

6. **Open the admin panel** at `/admin.html` to pull models, edit the system prompt, or run tests. On first visit you will be asked to create an admin password.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- USAGE EXAMPLES -->
## Usage

Fanoos is designed to stay out of your way, but a few features are worth knowing about.

### Chat & tools

Just type. If the model supports tool calling, Fanoos will automatically use the right tool — search the web for current facts, calculate instead of guessing, check the weather, convert units, roll dice, or look things up on Wikipedia. Tool calls appear in a collapsible log above the answer.

### DeepThink

If the selected model reports the `thinking` capability (for example `deepseek-r1:7b` or `qwen3:8b`), the **DeepThink** button in the top bar becomes active. Turn it on to see the model’s reasoning in a timed, collapsible block above the final answer. Use the **effort** chip to cycle between low, medium, and high reasoning depth.

### Search mode

Toggle **Search** in the top bar to force the model to ground its answer in live web sources. Fanoos will call the Python search server, read the top pages, and append clickable citations. If the Python server is not running, it falls back to Wikipedia.

### Memory

Say things like “I prefer Python over JavaScript” or use `/remember I work in backend development`. Fanoos extracts durable facts and carries them into every future chat. Open the memory panel from the sidebar or press `Ctrl+Shift+M` to edit or delete memories.

### Canvas

Open the canvas from the tools menu or with `/canvas`. Write or paste a document, select a passage, and use the buttons at the bottom to improve writing, fix grammar, summarize, continue, or run a custom instruction — the model rewrites only the selected text.

### Voice

Click the microphone icon in the top bar (or `/voice`) to start a voice conversation. Tap the lantern to speak; Fanoos replies aloud. Enable **Continuous** to keep listening after each reply.

### Admin panel

`/admin.html` is protected by a password. From there you can:

- See how many models are installed, how much disk they use, and what is currently loaded in RAM/VRAM.
- Pull any model from the built‑in catalog with live per‑layer progress, or pull a custom tag.
- Create a new model from a Modelfile template.
- Edit the global **Fanoos AI system prompt** that applies to every chat (the per‑user custom instructions from Settings are appended on top).
- Inspect, duplicate, rename, or delete installed models.
- Run a one‑shot prompt against any model with streaming output and token‑per‑second stats.
- Change the admin password (bcrypt‑hashed on the server when PHP is available).

### Keyboard shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift+Enter` | New line |
| `Ctrl+Shift+O` | New chat |
| `Ctrl+K` | Search chats |
| `Ctrl+B` | Toggle sidebar |
| `Ctrl+Shift+M` | Memory panel |
| `Ctrl+Shift+U` | Usage statistics |
| `Ctrl+/` | Shortcuts overlay |
| `/` | Command palette in composer |
| `Esc` | Close anything |

_For a deeper walkthrough of every feature, refer to the in‑app help overlay (`Ctrl+/`) and the tooltips throughout the interface._

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ROADMAP -->
## Roadmap

- [x] Local chat with Ollama streaming
- [x] Agentic tool calling (search, calculator, weather, Wikipedia, units, dice, UUID)
- [x] DeepThink with reasoning visibility and effort control
- [x] Persistent memory with auto‑extraction
- [x] Canvas editor with selection‑aware rewriting
- [x] Voice conversation mode
- [x] Admin panel with model management and live pull progress
- [x] PHP backend for multi‑device sync and bcrypt admin passwords
- [x] Python search server with page reading and citations
- [ ] Built‑in model benchmark suite
- [ ] Conversation branching visualizer
- [ ] PWA / offline install
- [ ] Additional tool integrations (calendar, email, code execution sandbox)

See the [open issues](https://github.com/ARGDeveloperShayan/fanoos-ui/issues) for a full list of proposed features (and known issues).

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTRIBUTING -->
## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag “enhancement”.
Don’t forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<p align="right">(<a href="#readme-top">back to top</a>)</p>

### Top contributors:

<a href="https://github.com/ARGDeveloperShayan/fanoos-ui/graphs/contributors">
  <img src="https://contrib.rocks/image?repo=ARGDeveloperShayan/fanoos-ui" alt="contrib.rocks image" />
</a>



<!-- LICENSE -->
## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- CONTACT -->
## Contact

Your Name - shayannateghi90@gmail.com

Project Link: [https://github.com/ARGDeveloperShayan/fanoos-ui](https://github.com/ARGDeveloperShayan/fanoos-ui)

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- ACKNOWLEDGMENTS -->
## Acknowledgments

* [Ollama](https://ollama.com) — the local inference engine that makes all of this possible.
* [Best-README-Template](https://github.com/othneildrew/Best-README-Template) — the structure of this document.
* [KaTeX](https://katex.org) — fast math rendering in chat.
* [Pyodide](https://pyodide.org) — in‑browser Python execution for the “Run” button on Python code blocks.
* [contrib.rocks](https://contrib.rocks) — contributor avatars.
* [Shields.io](https://shields.io) — README badges.
* [DuckDuckGo](https://duckduckgo.com) and [Bing](https://bing.com) — search backends for the Python server.
* [Open‑Meteo](https://open-meteo.com) — free weather data for the weather tool.
* [Wikipedia](https://wikipedia.org) — encyclopedia summaries for the Wikipedia tool.

<p align="right">(<a href="#readme-top">back to top</a>)</p>



<!-- MARKDOWN LINKS & IMAGES -->
<!-- https://www.markdownguide.org/basic-syntax/#reference-style-links -->
[contributors-shield]: https://img.shields.io/github/contributors/ARGDeveloperShayan/fanoos-ui.svg?style=for-the-badge
[contributors-url]: https://github.com/ARGDeveloperShayan/fanoos-ui/graphs/contributors
[forks-shield]: https://img.shields.io/github/forks/ARGDeveloperShayan/fanoos-ui.svg?style=for-the-badge
[forks-url]: https://github.com/ARGDeveloperShayan/fanoos-ui/network/members
[stars-shield]: https://img.shields.io/github/stars/ARGDeveloperShayan/fanoos-ui.svg?style=for-the-badge
[stars-url]: https://github.com/ARGDeveloperShayan/fanoos-ui/stargazers
[issues-shield]: https://img.shields.io/github/issues/ARGDeveloperShayan/fanoos-ui.svg?style=for-the-badge
[issues-url]: https://github.com/ARGDeveloperShayan/fanoos-ui/issues
[license-shield]: https://img.shields.io/github/license/ARGDeveloperShayan/fanoos-ui.svg?style=for-the-badge
[license-url]: https://github.com/ARGDeveloperShayan/fanoos-ui/blob/main/LICENSE.txt
[linkedin-shield]: https://img.shields.io/badge/-LinkedIn-black.svg?style=for-the-badge&logo=linkedin&colorB=555
[linkedin-url]: https://linkedin.com/in/ARGDeveloperShayan
[ollama-badge]: https://img.shields.io/badge/Ollama-000000?style=for-the-badge&logo=ollama&logoColor=white
[ollama-url]: https://ollama.com
[js-badge]: https://img.shields.io/badge/JavaScript-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black
[js-url]: https://developer.mozilla.org/en-US/docs/Web/JavaScript
[html-badge]: https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white
[html-url]: https://developer.mozilla.org/en-US/docs/Web/HTML
[css-badge]: https://img.shields.io/badge/CSS3-1572B6?style=for-the-badge&logo=css3&logoColor=white
[css-url]: https://developer.mozilla.org/en-US/docs/Web/CSS
[php-badge]: https://img.shields.io/badge/PHP-777BB4?style=for-the-badge&logo=php&logoColor=white
[php-url]: https://www.php.net
[python-badge]: https://img.shields.io/badge/Python-3776AB?style=for-the-badge&logo=python&logoColor=white
[python-url]: https://www.python.org