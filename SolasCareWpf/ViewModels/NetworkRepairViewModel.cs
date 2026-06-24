using System;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SolasCareWpf.Services;

namespace SolasCareWpf.ViewModels
{
    public partial class NetworkRepairViewModel : ObservableObject
    {
        [ObservableProperty]
        private bool _isRepairing;

        [ObservableProperty]
        private double _progressValue;

        [ObservableProperty]
        private string _statusText = "Ready to repair network adapters";

        [ObservableProperty]
        private string _networkLogs = "";

        [RelayCommand]
        private async Task FlushDnsAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            ProgressValue = 25;
            StatusText = "Flushing DNS Cache...";
            AddLog("Running: ipconfig /flushdns");

            await Task.Run(async () =>
            {
                var result = await PowerShellService.ExecuteCommandAsync("ipconfig /flushdns", 30000);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 100;
                    if (result.Success)
                    {
                        AddLog("✓ DNS cache flushed successfully.");
                        StatusText = "DNS cache flushed successfully.";
                    }
                    else
                    {
                        AddLog($"⚠ Error: {result.Error}");
                        StatusText = "DNS flush failed.";
                    }
                });
            });

            IsRepairing = false;
        }

        [RelayCommand]
        private async Task ResetWinsockAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            ProgressValue = 15;
            StatusText = "Resetting Winsock catalog...";
            AddLog("Running: netsh winsock reset");

            await Task.Run(async () =>
            {
                var result = await PowerShellService.ExecuteCommandAsync("netsh winsock reset", 30000);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 100;
                    if (result.Success)
                    {
                        AddLog("✓ Winsock catalog reset successfully. Reboot may be required.");
                        StatusText = "Winsock reset complete.";
                    }
                    else
                    {
                        AddLog($"⚠ Error: {result.Error}");
                        StatusText = "Winsock reset failed.";
                    }
                });
            });

            IsRepairing = false;
        }

        [RelayCommand]
        private async Task RepairAllNetworkAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            NetworkLogs = "Starting comprehensive network diagnostic and repair...\n";
            ProgressValue = 10;
            StatusText = "Flushing DNS resolver cache...";

            await Task.Run(async () =>
            {
                // DNS
                var r1 = await PowerShellService.ExecuteCommandAsync("ipconfig /flushdns", 30000);
                App.Current?.Dispatcher?.Invoke(() => AddLog(r1.Success ? "✓ DNS flushed." : "⚠ DNS flush error."));
                
                await Task.Delay(500);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 40;
                    StatusText = "Resetting Winsock Catalog API...";
                });

                // Winsock
                var r2 = await PowerShellService.ExecuteCommandAsync("netsh winsock reset", 30000);
                App.Current?.Dispatcher?.Invoke(() => AddLog(r2.Success ? "✓ Winsock reset." : "⚠ Winsock reset error."));

                await Task.Delay(500);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 70;
                    StatusText = "Resetting IP Stack (TCP/IP)...";
                });

                // IP Stack
                var r3 = await PowerShellService.ExecuteCommandAsync("netsh int ip reset", 30000);
                App.Current?.Dispatcher?.Invoke(() => AddLog(r3.Success ? "✓ TCP/IP reset." : "⚠ TCP/IP reset error."));

                await Task.Delay(500);

                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 100;
                    StatusText = "Network diagnostics and repair complete!";
                    AddLog("✓ Network Interface Card stack refreshed.");
                });
            });

            IsRepairing = false;
        }

        private void AddLog(string log)
        {
            App.Current?.Dispatcher?.Invoke(() =>
            {
                NetworkLogs += $"[{DateTime.Now:HH:mm:ss}] {log}\n";
            });
        }
    }
}
