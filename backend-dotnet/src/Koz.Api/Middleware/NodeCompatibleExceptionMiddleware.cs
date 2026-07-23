using Koz.Api.Configuration;
using Koz.Application.Auth;
using Koz.Application.Read;
using Koz.Application.Commerce;
using Koz.Application.Orders;
using Koz.Application.AdminCatalog;
using Koz.Application.AdminCustomers;
using Koz.Application.AdminOperations;
using Koz.Application.Payments;
using Koz.Application.Notifications;
using Koz.Application.Customers;

namespace Koz.Api.Middleware;

public sealed class NodeCompatibleExceptionMiddleware(RequestDelegate next, ILogger<NodeCompatibleExceptionMiddleware> logger)
{
    public async Task InvokeAsync(HttpContext context)
    {
        try
        {
            await next(context);
        }
        catch (AuthContractException exception)
        {
            if (context.Response.HasStarted)
            {
                logger.LogWarning(exception, "Auth contract error occurred after the response started for {Method} {Path}.", context.Request.Method, context.Request.Path);
                throw;
            }

            logger.LogInformation("Auth contract error {Code} while handling {Method} {Path}.", exception.Code, context.Request.Method, context.Request.Path);
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (ReadContractException exception)
        {
            if (context.Response.HasStarted)
            {
                logger.LogWarning(exception, "Read contract error occurred after the response started for {Method} {Path}.", context.Request.Method, context.Request.Path);
                throw;
            }

            logger.LogInformation("Read contract error {Code} while handling {Method} {Path}.", exception.Code, context.Request.Method, context.Request.Path);
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (CommerceContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (OrderContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (ManagerOrderContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (AdminCatalogContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (AdminCustomerContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (AdminOperationsContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (PaymentContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (NotificationContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (CustomerMutationContractException exception)
        {
            await WriteError(context, exception.StatusCode, exception.Message, exception.Code);
        }
        catch (DatabaseConfigurationException exception)
        {
            if (context.Response.HasStarted)
            {
                logger.LogWarning(exception, "Configuration error occurred after the response started for {Method} {Path}.", context.Request.Method, context.Request.Path);
                throw;
            }

            logger.LogError(exception, "Configuration error while handling {Method} {Path}.", context.Request.Method, context.Request.Path);
            await WriteError(context, StatusCodes.Status503ServiceUnavailable, "Configuration error", "configuration_error");
        }
        catch (OperationCanceledException exception) when (context.RequestAborted.IsCancellationRequested)
        {
            // Client disconnect / request abort is not a server fault.
            if (context.Response.HasStarted)
            {
                logger.LogDebug(exception, "Request aborted after the response started for {Method} {Path}.", context.Request.Method, context.Request.Path);
                throw;
            }

            logger.LogInformation("Request aborted while handling {Method} {Path}.", context.Request.Method, context.Request.Path);
            context.Response.StatusCode = StatusCodes.Status499ClientClosedRequest;
        }
        catch (Exception exception)
        {
            if (context.Response.HasStarted)
            {
                logger.LogWarning(exception, "Unhandled error occurred after the response started for {Method} {Path}.", context.Request.Method, context.Request.Path);
                throw;
            }

            logger.LogError(exception, "Unhandled error while handling {Method} {Path}.", context.Request.Method, context.Request.Path);
            await WriteError(context, StatusCodes.Status500InternalServerError, "Internal server error", "internal_error");
        }
    }

    private static Task WriteError(HttpContext context, int statusCode, string message, string code)
    {
        context.Response.StatusCode = statusCode;
        return context.Response.WriteAsJsonAsync(new { message, code });
    }
}
