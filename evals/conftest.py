import os
import sys

# Add parent directories to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'question-service'))
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backend'))

def pytest_configure(config):
    config.addinivalue_line("markers", "crawl: Unit-level tests (component correctness)")
    config.addinivalue_line("markers", "walk: Integration tests (golden dataset validation)")
    config.addinivalue_line("markers", "run: Simulation tests (text-based conversation)")
    config.addinivalue_line("markers", "azure: Tests requiring Azure credentials")
    config.addinivalue_line("markers", "crawl_harness: Crawl harness (TTS audio → Voice API single-turn)")
    config.addinivalue_line("markers", "walk_harness: Walk harness (noisy audio → Voice API single-turn)")
    config.addinivalue_line("markers", "run_harness: Run harness (model-simulated multi-turn)")
