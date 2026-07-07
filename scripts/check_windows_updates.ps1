$ErrorActionPreference = 'Stop'
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
            # Fix: Join-String is PowerShell 7+ only. Use -join operator instead.
            $categories = ($Update.Categories | Select-Object -ExpandProperty Name -ErrorAction SilentlyContinue) -join ", "
            $List += [PSCustomObject]@{
                Title = $Update.Title
                Description = $Update.Description
                KBArticleIDs = ($Update.KBArticleIDs -join ", ")
                Severity = $Update.MsrcSeverity
                Categories = $categories
            }
        }
        # Fix: ensure empty arrays serialize as "[]" not nothing/null on PS 5.1.
        if ($List.Count -eq 0) {
            Write-Output "[]"
        } elseif ($List.Count -eq 1) {
            # Single-object ConvertTo-Json would emit an object, not an array - wrap it.
            Write-Output "[$($List | ConvertTo-Json -Compress)]"
        } else {
            $List | ConvertTo-Json -Compress
        }
    }
} catch {
    # Surface the error as a JSON object so the UI can show what went wrong
    # instead of silently reporting "no updates".
    Write-Output ("{`"error`":`"" + ($_.Exception.Message -replace '[\\"]',' ') + "`"}")
}
