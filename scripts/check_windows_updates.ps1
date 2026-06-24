$ErrorActionPreference = 'SilentlyContinue'
try {
    $UpdateSession = New-Object -ComObject Microsoft.Update.Session
    $UpdateSearcher = $UpdateSession.CreateUpdateSearcher()
    # Search for uninstalled, visible, software updates
    $SearchResult = $UpdateSearcher.Search("IsInstalled=0 and Type='Software' and IsHidden=0")
    $Updates = $SearchResult.Updates
    if (-not $Updates -or $Updates.Count -eq 0) {
        Write-Output "[]"
    } else {
        $List = @()
        foreach ($Update in $Updates) {
            $List += [PSCustomObject]@{
                Title = $Update.Title
                Description = $Update.Description
                KBArticleIDs = ($Update.KBArticleIDs -join ", ")
                Severity = $Update.MsrcSeverity
                Categories = ($Update.Categories | Select-Object -ExpandProperty Name -ErrorAction SilentlyContinue -WarningAction SilentlyContinue -InformationAction SilentlyContinue -VerboseAction SilentlyContinue | Out-String -Stream | ForEach-Object { $_.Trim() } | Where-Object { $_ } | Join-String -Separator ", ")
            }
        }
        $List | ConvertTo-Json -Compress
    }
} catch {
    Write-Output "[]"
}
