using CommunityToolkit.Mvvm.ComponentModel;

namespace SolasCareWpf.Models
{
    // Fix HIGH: previously this was a POCO, so the DataTrigger bindings in
    // SpeedBoosterView.xaml (status pill, action button label) never re-fired
    // after ToggleStartupAppAsync flipped IsEnabled. Making it an ObservableObject
    // gives every property change notification so the UI stays in sync.
    public partial class StartupItem : ObservableObject
    {
        [ObservableProperty] private string _name = "";
        [ObservableProperty] private string _commandValue = "";
        [ObservableProperty] private string _registryPath = "";
        [ObservableProperty] private bool _isEnabled = true;
    }
}
