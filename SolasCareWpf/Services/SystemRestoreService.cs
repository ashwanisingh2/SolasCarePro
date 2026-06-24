using System;
using System.Runtime.InteropServices;
using System.Security.Principal;
using System.Management;

namespace SolasCareWpf.Services
{
    public enum RestorePointType : uint
    {
        ApplicationInstall = 0,
        ApplicationUninstall = 1,
        DeviceDriverInstall = 10,
        ModifySettings = 12,
        CancelledOperation = 13
    }

    public enum RestorePointEventType : uint
    {
        BeginningOfOperation = 100,
        EndOfOperation = 101
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct RestorePointInfo
    {
        public RestorePointEventType dwEventType;
        public RestorePointType dwRestorePointType;
        public long llSequenceNumber;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 256)]
        public string szDescription;
    }

    [StructLayout(LayoutKind.Sequential, Pack = 1)]
    public struct StateMgrStatus
    {
        public uint nStatus;
        public long llSequenceNumber;
    }

    public class SystemRestoreService
    {
        [DllImport("srclient.dll", CharSet = CharSet.Unicode, SetLastError = true)]
        private static extern bool SRSetRestorePointW(ref RestorePointInfo pRestorePtInfo, out StateMgrStatus pStatus);

        public static bool IsRunningAsAdmin()
        {
            using (var identity = WindowsIdentity.GetCurrent())
            {
                var principal = new WindowsPrincipal(identity);
                return principal.IsInRole(WindowsBuiltInRole.Administrator);
            }
        }

        public static bool CreateRestorePoint(string description, out long sequenceNumber)
        {
            sequenceNumber = 0;

            if (!IsRunningAsAdmin())
            {
                return false;
            }

            try
            {
                var info = new RestorePointInfo
                {
                    dwEventType = RestorePointEventType.BeginningOfOperation,
                    dwRestorePointType = RestorePointType.ModifySettings,
                    llSequenceNumber = 0,
                    szDescription = description
                };

                if (SRSetRestorePointW(ref info, out var status))
                {
                    sequenceNumber = status.llSequenceNumber;
                    return true;
                }
            }
            catch (DllNotFoundException)
            {
                return CreateRestorePointWmi(description, out sequenceNumber);
            }
            catch
            {
                return CreateRestorePointWmi(description, out sequenceNumber);
            }

            return false;
        }

        private static bool CreateRestorePointWmi(string description, out long sequenceNumber)
        {
            sequenceNumber = 0;
            try
            {
                var managementPath = new ManagementPath(@"\\.\root\default:SystemRestore");
                using (var managementClass = new ManagementClass(managementPath))
                {
                    var parameters = managementClass.GetMethodParameters("CreateRestorePoint");
                    parameters["Description"] = description;
                    parameters["RestorePointType"] = (uint)RestorePointType.ModifySettings;
                    parameters["EventType"] = (uint)RestorePointEventType.BeginningOfOperation;

                    using (var result = managementClass.InvokeMethod("CreateRestorePoint", parameters, null))
                    {
                        var returnValue = Convert.ToUInt32(result["ReturnValue"]);
                        if (returnValue == 0)
                        {
                            sequenceNumber = GetLatestRestorePointSequenceNumber();
                            return true;
                        }
                    }
                }
            }
            catch
            {
            }
            return false;
        }

        private static long GetLatestRestorePointSequenceNumber()
        {
            try
            {
                using (var key = Microsoft.Win32.Registry.LocalMachine.OpenSubKey(@"SOFTWARE\Microsoft\Windows NT\CurrentVersion\SystemRestore"))
                {
                    var val = key?.GetValue("LastRestorePointSeqNum");
                    if (val != null)
                    {
                        return Convert.ToInt64(val);
                    }
                }
            }
            catch { }
            return 0;
        }
    }
}
