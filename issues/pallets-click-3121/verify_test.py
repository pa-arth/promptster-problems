"""
Regression tests for flag_value with callable classes.
When a command has @click.option("--flag", flag_value=SomeClass, default=True),
the option should return the class itself, not instantiate it.
"""
import click
from click.testing import CliRunner


class Marker:
    """Sentinel class — should never be instantiated by click."""
    pass


class AnotherMarker:
    """Second sentinel class for multiple-flag test."""
    pass


def test_flag_value_returns_class_not_instance():
    """When no flag is passed, default should resolve to the class itself, not an instance."""

    @click.command()
    @click.option("--flag", "value", flag_value=Marker, type=click.UNPROCESSED, default=True)
    def cli(value):
        # Print whether we got the class or an instance
        if value is Marker:
            click.echo("CLASS", nl=False)
        elif isinstance(value, Marker):
            click.echo("INSTANCE", nl=False)
        else:
            click.echo(f"OTHER:{type(value).__name__}", nl=False)

    runner = CliRunner()
    result = runner.invoke(cli, [])
    assert result.exit_code == 0, f"CLI failed: {result.output}"
    assert result.output == "CLASS", (
        f"Expected flag_value class itself, got {result.output}. "
        "The default resolution is instantiating the class instead of returning it."
    )


def test_flag_value_explicit_flag_still_works():
    """When the flag IS passed explicitly, flag_value should be the class itself."""

    @click.command()
    @click.option("--flag", "value", flag_value=Marker, type=click.UNPROCESSED, default=True)
    def cli(value):
        if value is Marker:
            click.echo("CLASS", nl=False)
        elif isinstance(value, Marker):
            click.echo("INSTANCE", nl=False)
        else:
            click.echo(f"OTHER:{type(value).__name__}", nl=False)

    runner = CliRunner()
    result = runner.invoke(cli, ["--flag"])
    assert result.exit_code == 0, f"CLI failed: {result.output}"
    assert result.output == "CLASS", (
        f"Expected flag_value class itself when flag is passed, got {result.output}"
    )


def test_flag_value_with_multiple_flags():
    """Multiple flag_value options with callable classes should all return the class."""

    @click.command()
    @click.option("--a", "value", flag_value=Marker, type=click.UNPROCESSED, default=True)
    @click.option("--b", "other", flag_value=AnotherMarker, type=click.UNPROCESSED, default=True)
    def cli(value, other):
        parts = []
        parts.append("A_CLASS" if value is Marker else "A_INSTANCE")
        parts.append("B_CLASS" if other is AnotherMarker else "B_INSTANCE")
        click.echo(",".join(parts), nl=False)

    runner = CliRunner()
    result = runner.invoke(cli, [])
    assert result.exit_code == 0, f"CLI failed: {result.output}"
    assert result.output == "A_CLASS,B_CLASS", (
        f"Expected both flags to return classes, got {result.output}"
    )
