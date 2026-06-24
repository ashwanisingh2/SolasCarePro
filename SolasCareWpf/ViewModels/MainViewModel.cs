using System;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;

namespace SolasCareWpf.ViewModels
{
    public partial class MainViewModel : ObservableObject
    {
        private readonly DashboardViewModel _dashboardVm;
        private readonly SmartScanViewModel _smartScanVm;
        private readonly SystemRepairViewModel _systemRepairVm;
        private readonly JunkCleanerViewModel _junkCleanerVm;
        private readonly SpeedBoosterViewModel _speedBoosterVm;
        private readonly NetworkRepairViewModel _networkRepairVm;
        private readonly SettingsViewModel _settingsVm;

        [ObservableProperty]
        private ObservableObject _currentViewModel;

        [ObservableProperty]
        private string _activeTabName = "Dashboard";

        public MainViewModel()
        {
            // Initialize viewmodels
            _dashboardVm = new DashboardViewModel(Navigate);
            _smartScanVm = new SmartScanViewModel();
            _systemRepairVm = new SystemRepairViewModel();
            _junkCleanerVm = new JunkCleanerViewModel();
            _speedBoosterVm = new SpeedBoosterViewModel();
            _networkRepairVm = new NetworkRepairViewModel();
            _settingsVm = new SettingsViewModel();

            // Set default view
            _currentViewModel = _dashboardVm;
        }

        [RelayCommand]
        public void Navigate(string destination)
        {
            if (string.IsNullOrWhiteSpace(destination)) return;

            ActiveTabName = destination;
            CurrentViewModel = destination switch
            {
                "Dashboard" => _dashboardVm,
                "Smart Scan" => _smartScanVm,
                "System Repair" => _systemRepairVm,
                "Junk Files" => _junkCleanerVm,
                "Speed Booster" => _speedBoosterVm,
                "Network Repair" => _networkRepairVm,
                "Settings" => _settingsVm,
                _ => _dashboardVm
            };
        }
    }
}
