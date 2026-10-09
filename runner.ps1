
        $e = $null
        $t = $null
        $ast = [System.Management.Automation.Language.Parser]::ParseFile((Resolve-Path temp_test.ps1), [ref]$t, [ref]$e)
        if ($e.Count -gt 0 -and $e[0].Extent.StartLineNumber -eq 147) {
          Write-Host "FOUND MATCH removing char at line 50 col 49: $($e[0].ErrorId) at line $($e[0].Extent.StartLineNumber)"
          foreach ($item in $e) {
            Write-Host "   $($item.Extent.StartLineNumber): $($item.ErrorId)"
          }
        }
      