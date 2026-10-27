$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$iconDirectory = Join-Path $PSScriptRoot '../assets'
New-Item -ItemType Directory -Path $iconDirectory -Force | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256,256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = 'AntiAlias'
$graphics.Clear([System.Drawing.Color]::Transparent)
$shape = New-Object System.Drawing.Drawing2D.GraphicsPath
$shape.AddArc(8,8,70,70,180,90)
$shape.AddArc(178,8,70,70,270,90)
$shape.AddArc(178,178,70,70,0,90)
$shape.AddArc(8,178,70,70,90,90)
$shape.CloseFigure()
$brush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(75,139,255))
$graphics.FillPath($brush,$shape)
$font = New-Object System.Drawing.Font 'Segoe UI',134,([System.Drawing.FontStyle]::Bold),([System.Drawing.GraphicsUnit]::Pixel)
$format = New-Object System.Drawing.StringFormat
$format.Alignment = 'Center'
$format.LineAlignment = 'Center'
$graphics.DrawString('G',$font,[System.Drawing.Brushes]::White,(New-Object System.Drawing.RectangleF 0,0,256,245),$format)
$stream = New-Object System.IO.MemoryStream
$bitmap.Save($stream,[System.Drawing.Imaging.ImageFormat]::Png)
$png = $stream.ToArray()
$output = [System.IO.File]::Create((Join-Path $iconDirectory 'gems.ico'))
$writer = New-Object System.IO.BinaryWriter $output
$writer.Write([byte[]](0,0,1,0,1,0,0,0,0,0,1,0,32,0))
$writer.Write([uint32]$png.Length)
$writer.Write([uint32]22)
$writer.Write($png)
$writer.Dispose()
$stream.Dispose()
$graphics.Dispose()
$bitmap.Dispose()
$brush.Dispose()
$shape.Dispose()
$font.Dispose()
$format.Dispose()
