using System;
using System.Diagnostics;
using System.Text;
using System.Threading;
using System.Threading.Tasks;

namespace SolasCareWpf.Services
{
    public class PowerShellResult
    {
        public bool Success { get; set; }
        public string Output { get; set; }
        public string Error { get; set; }
        public int ExitCode { get; set; }
    }

    public class PowerShellService
    {
        public static async Task<PowerShellResult> ExecuteCommandAsync(string command, int timeoutMs = 180000)
        {
            var result = new PowerShellResult();
            var outputBuilder = new StringBuilder();
            var errorBuilder = new StringBuilder();

            var psi = new ProcessStartInfo
            {
                FileName = "powershell.exe",
                Arguments = $"-NoProfile -ExecutionPolicy Bypass -Command \"{command}\"",
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };

            using (var process = new Process { StartInfo = psi })
            {
                using (var outputCloseEvent = new SemaphoreSlim(0))
                using (var errorCloseEvent = new SemaphoreSlim(0))
                {
                    process.OutputDataReceived += (s, e) =>
                    {
                        if (e.Data == null)
                        {
                            outputCloseEvent.Release();
                        }
                        else
                        {
                            outputBuilder.AppendLine(e.Data);
                        }
                    };

                    process.ErrorDataReceived += (s, e) =>
                    {
                        if (e.Data == null)
                        {
                            errorCloseEvent.Release();
                        }
                        else
                        {
                            errorBuilder.AppendLine(e.Data);
                        }
                    };

                    try
                    {
                        if (!process.Start())
                        {
                            result.Success = false;
                            result.Error = "Failed to start Process 'powershell.exe'.";
                            return result;
                        }

                        process.BeginOutputReadLine();
                        process.BeginErrorReadLine();

                        var processTask = Task.Run(() => process.WaitForExit());
                        var timeoutTask = Task.Delay(timeoutMs);

                        if (await Task.WhenAny(processTask, timeoutTask) == timeoutTask)
                        {
                            try
                            {
                                process.Kill();
                                using (var taskKill = Process.Start(new ProcessStartInfo
                                {
                                    FileName = "taskkill",
                                    Arguments = $"/F /T /PID {process.Id}",
                                    CreateNoWindow = true,
                                    UseShellExecute = false
                                }))
                                {
                                    taskKill?.WaitForExit(5000);
                                }
                            }
                            catch { }

                            result.Success = false;
                            result.Error = $"PowerShell execution timed out after {timeoutMs / 1000}s.";
                            return result;
                        }

                        await Task.WhenAll(
                            outputCloseEvent.WaitAsync(),
                            errorCloseEvent.WaitAsync()
                        );

                        result.ExitCode = process.ExitCode;
                        result.Success = process.ExitCode == 0;
                        result.Output = outputBuilder.ToString().Trim();
                        result.Error = errorBuilder.ToString().Trim();
                    }
                    catch (Exception ex)
                    {
                        result.Success = false;
                        result.Error = $"Runtime Shell Exception: {ex.Message}";
                    }
                }
            }

            return result;
        }
    }
}
