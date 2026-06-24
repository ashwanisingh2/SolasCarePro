using System;

namespace SolasCareWpf.Models
{
    public class ScanItem
    {
        public string Title { get; set; }
        public string Details { get; set; }
        public string Category { get; set; } // "Junk Files", "Registry Errors", "Privacy Traces"
        public long SizeBytes { get; set; }
        public bool IsSelected { get; set; } = true;
    }
}
