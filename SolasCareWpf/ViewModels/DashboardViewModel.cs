using System;
using System.IO;
using System.Diagnostics;
using System.Threading;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace SolasCareWpf.ViewModels
{
    public partial class DashboardViewModel : ObservableObject, IDisposable
    {
        [ObservableProperty]
        private string _cpuUsage = "0%";

        [ObservableProperty]
        private string _ramUsage = "0%";

        [ObservableProperty]
        private string _diskFreeSpace = "0 GB";

        [ObservableProperty]
        private double _cpuValue = 0;

        [ObservableProperty]
        private double _ramValue = 0;

        [ObservableProperty]
        private double _diskValue = 0;

        [ObservableProperty]
        private int _healthScore = 85;

        [ObservableProperty]
        private string _healthColor = "#34D399"; // Emerald

        private readonly CancellationTokenSource _cts = new();
        private readonly Action<string> _navigateToTab;

        public DashboardViewModel(Action<string> navigateToTab)
        {
            _navigateToTab = navigateToTab;
            StartMetricUpdates();
        }

        [RelayCommand]
        private void QuickAction(string actionType)
        {
            if (actionType == "scan")
            {
                _navigateToTab?.Invoke("Smart Scan");
            }
            else if (actionType == "registry")
            {
                _navigateToTab?.Invoke("System Repair");
            }
            else if (actionType == "junk")
            {
                _navigateToTab?.Invoke("Junk Files");
            }
        }

        private void StartMetricUpdates()
        {
            Task.Run(async () =>
            {
                var cpuCounter = new PerformanceCounter("Processor", "% Processor Time", "_Total");
                var ramCounter = new PerformanceCounter("Memory", "Available MBytes");
                
                // Get Total RAM
                double totalRamMb = 8192; // default fallback 8GB
                try
                {
                    using (var searcher = new System.Management.ManagementObjectSearcher("SELECT TotalPhysicalMemory FROM Win32_ComputerSystem"))
                    using (var collection = searcher.Get())
                    {
                        foreach (var obj in collection)
                        {
                            totalRamMb = Convert.ToDouble(obj["TotalPhysicalMemory"]) / (1024.0 * 1024.0);
                            break;
                        }
                    }
                }
                catch { }

                while (!_cts.Token.IsCancellationRequested)
                {
                    try
                    {
                        float cpuVal = cpuCounter.NextValue();
                        // Sleep briefly for correct NextValue reading
                        await Task.Delay(100, _cts.Token);
                        cpuVal = cpuCounter.NextValue();

                        float freeRamMb = ramCounter.NextValue();
                        double usedRamPercent = ((totalRamMb - freeRamMb) / totalRamMb) * 100.0;

                        // Disk details
                        var drive = new DriveInfo("C");
                        double freeSpaceGb = drive.AvailableFreeSpace / (1024.0 * 1024.0 * 1024.0);
                        double totalSpaceGb = drive.TotalSize / (1024.0 * 1024.0 * 1024.0);
                        double usedDiskPercent = ((totalSpaceGb - freeSpaceGb) / totalSpaceGb) * 100.0;

                        App.Current?.Dispatcher?.Invoke(() =>
                        {
                            CpuValue = Math.Round(cpuVal);
                            CpuUsage = $"{CpuValue}%";

                            RamValue = Math.Round(usedRamPercent);
                            RamUsage = $"{RamValue}%";

                            DiskValue = Math.Round(usedDiskPercent);
                            DiskFreeSpace = $"{Math.Round(freeSpaceGb, 1)} GB Free of {Math.Round(totalSpaceGb)} GB";

                            // Health logic
                            double totalStress = (CpuValue + RamValue) / 2.0;
                            HealthScore = (int)Math.Max(50, 100 - totalStress);
                            HealthColor = HealthScore > 80 ? "#34D399" : (HealthScore > 60 ? "#FBBF24" : "#F87171");
                        });
                    }
                    catch { }

                    await Task.Delay(2000, _cts.Token);
                }
            }, _cts.Token);
        }

        public void Dispose()
        {
            _cts.Cancel();
            _cts.Dispose();
        }
    }
}
