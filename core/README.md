# Core Boundary

This directory is the intended home for the reusable article-processing engine.

Near-term migration plan:
- move URL normalization here
- move article fetch/extract/cleanup here
- move EPUB conversion orchestration here
- keep the Java CLI as the reference path while the web app wraps the same behavior

The goal is not a rewrite. The goal is to preserve the working pipeline and expose
it behind a stable interface that both the CLI and web worker can call.
