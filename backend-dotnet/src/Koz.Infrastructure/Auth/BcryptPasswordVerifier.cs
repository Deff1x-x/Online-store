using Koz.Application.Auth;

namespace Koz.Infrastructure.Auth;

public sealed class BcryptPasswordVerifier : IPasswordVerifier
{
    public bool Verify(string password, string passwordHash) => BCrypt.Net.BCrypt.Verify(password, passwordHash);
}
