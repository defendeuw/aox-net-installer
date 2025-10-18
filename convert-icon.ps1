# PowerShell script to convert PNG to ICO
Add-Type -AssemblyName System.Drawing

Write-Host "Converting AoXBlue.png to ICO format..." -ForegroundColor Cyan

try {
    $png = [System.Drawing.Image]::FromFile("$PSScriptRoot\AoXBlue.png")
    
    # Create icon with multiple sizes
    $sizes = @(16, 24, 32, 48, 64, 128, 256)
    $ms = New-Object System.IO.MemoryStream
    
    # For simplicity, just create one size (256x256) and let Windows scale
    $icon = [System.Drawing.Icon]::FromHandle($png.GetHicon())
    
    # Save as ICO
    $fs = [System.IO.File]::Create("$PSScriptRoot\icon.ico")
    $icon.Save($fs)
    $fs.Close()
    
    # Copy to AoX.ico
    Copy-Item "$PSScriptRoot\icon.ico" "$PSScriptRoot\AoX.ico" -Force
    
    $png.Dispose()
    
    Write-Host "✅ Successfully created icon.ico and AoX.ico!" -ForegroundColor Green
}
catch {
    Write-Host "❌ Error: $_" -ForegroundColor Red
    Write-Host "`n💡 Alternative: Use https://convertio.co/png-ico/" -ForegroundColor Yellow
    Write-Host "   Upload AoXBlue.png, download as icon.ico, and save to this folder" -ForegroundColor Yellow
}
