# airllm-packaging

RudraLabs' build and release pipeline for [AirLLM](https://github.com/lyogavin/airllm).
It takes AirLLM source — upstream or our fork [RudraLabs-dev/airllm](https://github.com/RudraLabs-dev/airllm) —
and publishes installable packages on the [Releases](https://github.com/RudraLabs-dev/airllm-packaging/releases) page:

| Platform | Package |
|---|---|
| Debian 12+, Ubuntu 22.04+ (x86_64, arm64) | `airllm_<ver>-<rev>_<arch>.deb` |
| Fedora, RHEL / Rocky / Alma 8+ (x86_64, aarch64) | `airllm-<ver>-<rev>.<arch>.rpm` |
| Windows 10/11 x64 | `AirLLM-<ver>-<rev>-setup-x64.exe` installer, `…-windows-x64.zip` portable |

Every package is **self-contained**: it bundles its own CPython ([python-build-standalone](https://github.com/astral-sh/python-build-standalone)),
CPU-only PyTorch, transformers and AirLLM, so it never touches the system Python and works the same on every distro.

## Using the packages

```sh
sudo apt install ./airllm_4.0.0-1_amd64.deb        # Debian / Ubuntu
sudo dnf install ./airllm-4.0.0-1.x86_64.rpm       # Fedora / RHEL / Rocky / Alma

airllm-python my_script.py                         # the bundled interpreter
airllm-python -c "from airllm import AutoModel"
cat /opt/airllm/share/airllm/BUILDINFO             # exact source commit, torch, python versions
```

**NVIDIA GPU.** The packages ship CPU-only PyTorch so they stay well under GitHub's 2 GiB asset limit.
Switch to a CUDA build once after installing:

```sh
sudo airllm-enable-cuda            # default CUDA variant (see packaging/versions.env)
sudo airllm-enable-cuda cu126      # or any variant listed on https://pytorch.org/get-started/locally/
airllm-enable-cuda status
sudo airllm-enable-cuda disable    # back to CPU
```

The CUDA wheels go to `/var/lib/airllm/cuda-site` (Windows: `<install dir>\cuda-site`), which `airllm-python` puts first on the path.
Package upgrades never overwrite it; re-run the command after an upgrade that changes the torch version (the installer reminds you).
Older GPUs or drivers may need an older `cu12x` variant.

**Windows.** Run the installer (all users or just you), open a new terminal or the *AirLLM Command Prompt* shortcut, then use
`airllm-python` and `airllm-enable-cuda` as above (from an Administrator prompt if installed under Program Files).
Silent install: `AirLLM-…-setup-x64.exe /VERYSILENT /SUPPRESSMSGBOXES /NORESTART [/DIR=D:\AirLLM] [/CURRENTUSER]`.

**Verify a download.** `sha256sum -c SHA256SUMS`, and `gh attestation verify <file> --repo RudraLabs-dev/airllm-packaging`
(each release carries a signed build-provenance attestation).

## How the pipeline works

```
watch-upstream.yml (daily 08:07 IST)          release.yml (manual / called / PR)
 ├─ sync-fork: fork main  ← upstream main      prepare ── resolve ref → checkout source → versions → wheel + sdist
 └─ new upstream tag? ──────────────────────▶   ├─ linux (x86_64, aarch64): payload in /opt/airllm → nfpm → .deb + .rpm
                                                 │    └─ test-linux: install / smoke test / uninstall on
                                                 │       Debian 12, 13 · Ubuntu 22.04, 24.04 · Fedora · Rocky 9 · Alma 8
                                                 ├─ windows: payload → Inno Setup .exe + .zip → silent install test
                                                 └─ release: SHA256SUMS + provenance → GitHub Release (draft → public)
```

* **Automatic:** when upstream tags a release (`vX.Y.Z`), the next daily run packages it as release `vX.Y.Z-1`.
* **Manual:** *Actions → Build & release packages → Run workflow*, with
  * `airllm_ref` — tag, branch or commit (empty = latest tag),
  * `source_repo` — `lyogavin/airllm` or our fork (e.g. to ship a fix before upstream merges it),
  * `pkg_release` — bump to re-release the same AirLLM version with packaging changes (`v4.0.0-2`),
  * `publish` — untick to build and test without releasing.
* Branch / commit builds are versioned `X.Y.Z+gitYYYYMMDD.<sha>` and published as pre-releases.
* Pull requests that touch `packaging/` run the full build and install tests but never publish.

### Repository layout

```
packaging/versions.env           every pin: Python, PyTorch index, nfpm, CUDA default, repo names
packaging/linux/                 build-payload.sh, build-packages.sh, nfpm.yaml, launchers, maintainer scripts
packaging/windows/               build-payload.ps1, airllm.iss (Inno Setup), .cmd/.ps1 launchers
packaging/ci/                    ref/version resolution, container install test
packaging/tests/smoke_test.py    run on every payload and every installed package
.github/workflows/               release.yml, watch-upstream.yml, lint.yml
scripts/dev-setup.sh             contributor clone of the fork with upstream wired up
```

### Building locally (Linux)

```sh
pipx run build --wheel --outdir dist /path/to/airllm/air_llm
sudo packaging/linux/build-payload.sh --wheel dist/airllm-*.whl          # → /opt/airllm
packaging/linux/build-packages.sh --version 4.0.0 --release 1 --out out   # → out/*.deb, out/*.rpm
```

## One-time setup (org admins)

| What | Why |
|---|---|
| Secret `FORK_SYNC_TOKEN` (fine-grained PAT, repo `RudraLabs-dev/airllm`, *Contents: read & write*) | Lets the daily job fast-forward the fork. Optional — without it, use *Sync fork* on GitHub. |
| *Settings → Actions → General*: allow GitHub Actions | Workflows request `contents: write` only in the release job. |
| Branch protection on `main` requiring the **Lint** check | Pipeline changes go through PRs, which run the full build and tests. |

Bumping a pin (Python, nfpm, CUDA default) is a one-line PR to `packaging/versions.env`; Dependabot keeps the SHA-pinned actions current.

## Contributing to AirLLM

See [CONTRIBUTING.md](CONTRIBUTING.md) for how we send changes upstream through the org fork.

Licensed under Apache-2.0, like AirLLM. Bundled components keep their own licences.
