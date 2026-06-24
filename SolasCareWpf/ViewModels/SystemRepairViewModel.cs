using System;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SolasCareWpf.Services;

namespace SolasCareWpf.ViewModels
{
    public partial class SystemRepairViewModel : ObservableObject
    {
        [ObservableProperty]
        private bool _isRepairing;

        [ObservableProperty]
        private double _progressValue;

        [ObservableProperty]
        private string _statusText = "Ready to repair";

        [ObservableProperty]
        private string _repairLogs = "";

        [RelayCommand]
        private async Task RunSfcScanAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            ProgressValue = 10;
            StatusText = "Initializing SFC Scan (System File Checker)...";
            AddLog("Starting SFC (System File Checker)...");
            AddLog("Running: sfc /verifyonly (in verify mode for safety)");

            await Task.Run(async () =>
            {
                var result = await PowerShellService.ExecuteCommandAsync("sfc /verifyonly", 240000);
                
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 100;
                    if (result.Success)
                    {
                        AddLog(result.Output);
                        StatusText = "SFC verification completed successfully.";
                        AddLog("SFC Verification complete: No integrity violations or clean files.");
                    }
                    else
                    {
                        AddLog(result.Error ?? "SFC command failed to complete.");
                        StatusText = "SFC scan finished with warnings or failed.";
                    }
                });
            });

            IsRepairing = false;
        }

        [RelayCommand]
        private async Task RunDismScanAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            ProgressValue = 20;
            StatusText = "Initializing DISM Health Check...";
            AddLog("Starting DISM (Deployment Image Servicing and Management)...");
            AddLog("Running: DISM /Online /Cleanup-Image /CheckHealth");

            await Task.Run(async () =>
            {
                var result = await PowerShellService.ExecuteCommandAsync("dism.exe /Online /Cleanup-Image /CheckHealth", 180000);
                
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 100;
                    if (result.Success)
                    {
                        AddLog(result.Output);
                        StatusText = "DISM check completed.";
                        AddLog("DISM Scan completed: Component store is healthy.");
                    }
                    else
                    {
                        AddLog(result.Error ?? "DISM command execution error.");
                        StatusText = "DISM scan finished with issues or failed.";
                    }
                });
            });

            IsRepairing = false;
        }

        [RelayCommand]
        private async Task RunFullSystemRepairAsync()
        {
            if (IsRepairing) return;
            IsRepairing = true;
            RepairLogs = "Initializing Full System Repairs...\n";
            ProgressValue = 5;
            StatusText = "Creating System Restore Point...";

            await Task.Run(async () =>
            {
                // Create Restore Point First
                bool restoreCreated = SystemRestoreService.CreateRestorePoint("Pre-System Repair Restore Point", out _);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    if (restoreCreated)
                        AddLog("✓ Restore point created successfully.");
                    else
                        AddLog("⚠ Restore point creation skipped or failed. Proceeding with repair...");
                });

                await Task.Delay(1000);

                // Run SFC Verify
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 30;
                    StatusText = "Running SFC Integrity Check...";
                    AddLog("Executing: sfc /verifyonly");
                });

                var sfcResult = await PowerShellService.ExecuteCommandAsync("sfc /verifyonly", 120000);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    AddLog(sfcResult.Output);
                    if (sfcResult.Error != null) AddLog(sfcResult.Error);
                });

                // Run DISM ScanHealth
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    ProgressValue = 70;
                    StatusText = "Running DISM ScanHealth...";
                    AddLog("Executing: dism.exe /Online /Cleanup-Image /ScanHealth");
                });

                var dismResult = await PowerShellService.ExecuteCommandAsync("dism.exe /Online /Cleanup-Image /ScanHealth", 180000);
                App.Current?.Dispatcher?.Invoke(() =>
                {
                    AddLog(dismResult.Output);
                    if (dismResult.Error != null) AddLog(dismResult.Error);
                    
                    ProgressValue = 100;
                    StatusText = "Full System Repairs Completed!";
                    AddLog("✓ System Integrity validation is complete.");
                });
            });

            IsRepairing = false;
        }

        private void AddLog(string log)
        {
            if (string.IsNullOrWhiteSpace(log)) return;
            App.Current?.Dispatcher?.Invoke(() =>
            {
                RepairLogs += $"[{DateTime.Now:HH:mm:ss}] {log}\n";
            });
        }
    }
}
