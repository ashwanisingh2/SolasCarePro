using System;
using System.Threading.Tasks;
using CommunityToolkit.Mvvm.ComponentModel;
using CommunityToolkit.Mvvm.Input;
using SolasCareWpf.Services;

namespace SolasCareWpf.ViewModels
{
    public partial class SettingsViewModel : ObservableObject
    {
        [ObservableProperty]
        private bool _isDarkTheme = true;

        [ObservableProperty]
        private bool _autoBackupBeforeRepair = true;

        [ObservableProperty]
        private string _restorePointDescription = "Manual Restore Point";

        [ObservableProperty]
        private bool _isCreatingRestorePoint;

        [ObservableProperty]
        private string _restorePointStatusText = "";

        [RelayCommand]
        private async Task CreateManualRestorePointAsync()
        {
            if (string.IsNullOrWhiteSpace(RestorePointDescription))
            {
                RestorePointStatusText = "Description cannot be empty.";
                return;
            }

            IsCreatingRestorePoint = true;
            RestorePointStatusText = "Creating Windows System Restore Point. Please wait...";

            bool success = await Task.Run(() =>
            {
                return SystemRestoreService.CreateRestorePoint(RestorePointDescription, out _);
            });

            if (success)
            {
                RestorePointStatusText = "✓ Restore Point created successfully.";
            }
            else
            {
                RestorePointStatusText = "⚠ Failed to create Restore Point. Ensure Admin rights are enabled.";
            }

            IsCreatingRestorePoint = false;
        }
    }
}
