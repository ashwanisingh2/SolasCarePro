using System;

namespace SolasCareWpf.Models
{
    public class StartupItem
    {
        public string Name { get; set; } = "";
        public string CommandValue { get; set; } = "";
        public string RegistryPath { get; set; } = "";
        public bool IsEnabled { get; set; } = true;
    }
}
