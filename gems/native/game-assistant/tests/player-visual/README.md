# Player menu drawing check

From the `gems/` application directory, build `PlayerVisualCheck.csproj` and run
the generated net48 executable with an independent screenshot output directory
and a fresh fixture directory. See `STAGE5-0.1.82.md` for exact commands.

This compiles the actual player menu, controller and Chinese GDI panel. The SDK
sprite API is a recording/drawing substitute; the images are not game captures.
The checks cover actual request values, scrolling, failure text, reopening after
an interruption, long coordinates, and 1,000 changing multiplier frames. Static
text is first drawn before counting stable texture paths. A long SDK exception
is retained for logging, not inserted into the glyph cache or action warning.
