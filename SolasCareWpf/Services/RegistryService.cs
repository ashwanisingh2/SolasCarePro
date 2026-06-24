using System;
using System.Diagnostics;
using System.IO;
using Microsoft.Win32;

namespace SolasCareWpf.Services
{
    public class RegistryService
    {
        public static bool BackupRegistryKey(string keyPath, string outputFilePath)
        {
            if (string.IsNullOrWhiteSpace(keyPath) || string.IsNullOrWhiteSpace(outputFilePath))
                return false;

            try
            {
                var dir = Path.GetDirectoryName(outputFilePath);
                if (!Directory.Exists(dir))
                {
                    Directory.CreateDirectory(dir);
                }

                var psi = new ProcessStartInfo
                {
                    FileName = "reg.exe",
                    Arguments = $"export \"{keyPath}\" \"{outputFilePath}\" /y",
                    CreateNoWindow = true,
                    UseShellExecute = false,
                    RedirectStandardError = true,
                    RedirectStandardOutput = true
                };

                using (var process = Process.Start(psi))
                {
                    process.WaitForExit(5000);
                    return process.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        public static bool RestoreRegistryKey(string backupFilePath)
        {
            if (!File.Exists(backupFilePath))
                return false;

            try
            {
                var psi = new ProcessStartInfo
                {
                    FileName = "reg.exe",
                    Arguments = $"import \"{backupFilePath}\"",
                    CreateNoWindow = true,
                    UseShellExecute = false
                };

                using (var process = Process.Start(psi))
                {
                    process.WaitForExit(5000);
                    return process.ExitCode == 0;
                }
            }
            catch
            {
                return false;
            }
        }

        public static bool RepairRegistryKey(string hive, string subKey, string valueName, string newValue)
        {
            string fullPath = $@"{hive}\{subKey}";
            string backupPath = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.ApplicationData), 
                "SolasCareWpf", "RegBackups", $"backup_{DateTime.Now:yyyyMMdd_HHmmss}.reg");

            // Backup first
            if (!BackupRegistryKey(fullPath, backupPath))
            {
                return false;
            }

            try
            {
                RegistryKey baseKey = hive.ToUpper() switch
                {
                    "HKEY_CURRENT_USER" => Registry.CurrentUser,
                    "HKEY_LOCAL_MACHINE" => Registry.LocalMachine,
                    "HKEY_CLASSES_ROOT" => Registry.ClassesRoot,
                    _ => throw new ArgumentException("Unsupported registry hive")
                };

                using (var key = baseKey.OpenSubKey(subKey, true))
                {
                    if (key != null)
                    {
                        key.SetValue(valueName, newValue, RegistryValueKind.String);
                        return true;
                    }
                }
            }
            catch
            {
                // Rollback on failure
                RestoreRegistryKey(backupPath);
            }
            return false;
        }
    }
}
