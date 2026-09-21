param (
    [string]$FtpHost = "orthofixspecialityclinic.com",
    [string]$Username = "agamtwb@gmail.com",
    [string]$Password = "Agamtwb@2026",
    [string]$RemoteDir = "public_html"
)

Write-Host "======================================================="
Write-Host "Starting BigRock FTP Upload to $FtpHost"
Write-Host "======================================================="

$ZipFile = "$PSScriptRoot\orthofix-pharmacy-working-project.zip"
Write-Host "Zip file path: $ZipFile"

$FtpUri = "ftp://$FtpHost/orthofix-pharmacy-working-project.zip"
if ($RemoteDir -ne "") {
    $FtpUri = "ftp://$FtpHost/$RemoteDir/orthofix-pharmacy-working-project.zip"
}

Write-Host "Uploading to: $FtpUri"

$webclient = New-Object System.Net.WebClient
$webclient.Credentials = New-Object System.Net.NetworkCredential($Username, $Password)
$webclient.Proxy = $null

try {
    $webclient.UploadFile($FtpUri, "STOR", $ZipFile)
    Write-Host "SUCCESS: Upload completed successfully!"
} catch {
    Write-Host "ERROR: Upload failed: $_"
}
