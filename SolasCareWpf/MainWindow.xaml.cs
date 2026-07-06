using System;
using System.Windows;

namespace SolasCareWpf;

/// <summary>
/// Interaction logic for MainWindow.xaml
/// </summary>
public partial class MainWindow : Window
{
    public MainWindow()
    {
        InitializeComponent();
    }

    // Fix HIGH: dispose the MainViewModel (which forwards to DashboardViewModel)
    // when the window closes. Without this the DashboardViewModel's polling
    // Task + PerformanceCounter native handles leak until process exit.
    protected override void OnClosed(EventArgs e)
    {
        (DataContext as IDisposable)?.Dispose();
        base.OnClosed(e);
    }
}
