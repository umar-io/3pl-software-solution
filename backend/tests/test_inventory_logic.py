import pytest

from app.services import inventory_service as svc


@pytest.mark.parametrize(
    "expected, actual, reserved, want",
    [
        (100, 100 - 60, 0, "critical"),      # >= 50 units short
        (33, 12, 15, "critical"),            # counted below reserved stock
        (37, 23, 0, "critical"),             # 38% and 14 units short
        (94, 85, 0, "moderate"),             # ~10% short
        (60, 57, 0, "minor"),                # tiny
        (20, 28, 0, "moderate"),             # overage on a small bin
        (20, 22, 0, "minor"),
        (500, 620, 0, "critical"),           # large overage
    ],
)
def test_severity(expected, actual, reserved, want):
    assert svc._severity(expected, actual, reserved) == want


def _line(expected):
    return {"expected": float(expected)}


def _var(sev, diff):
    return {"status": "open", "severity": sev, "difference": diff}


def test_no_variances_is_perfect():
    acc = svc._accuracy([_line(10)] * 5, [])
    assert svc._score(acc) == 100.0


def test_critical_hurts_more_than_minor():
    lines = [_line(100)] * 10
    minor = svc._score(svc._accuracy(lines, [_var("minor", -2)]))
    critical = svc._score(svc._accuracy(lines, [_var("critical", -2)]))
    assert critical < minor < 100


def test_resolved_variances_do_not_count():
    lines = [_line(100)] * 4
    resolved = {**_var("critical", -50), "status": "resolved"}
    assert svc._score(svc._accuracy(lines, [resolved])) == 100.0


@pytest.mark.parametrize("score, band", [(95, "good"), (90, "good"), (89.9, "attention"), (75, "attention"), (74.9, "critical")])
def test_health_bands(score, band):
    assert svc._status_for(score) == band
