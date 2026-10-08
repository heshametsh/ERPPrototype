namespace ContractorERP.BuildingBlocks.Results;

public enum ErrorKind
{
    Validation,
    NotFound,
    Forbidden,
    Conflict,
}

/// <summary>A business error. <see cref="Target"/> lets the UI mark the exact row/cell.</summary>
public sealed record Error(ErrorKind Kind, string Code, string Message, string? Target = null);

/// <summary>Outcome of a use case: either a value or a list of business errors. No exceptions for expected failures.</summary>
public sealed class Result<T>
{
    private Result(T? value, IReadOnlyList<Error> errors)
    {
        Value = value;
        Errors = errors;
    }

    public T? Value { get; }

    public IReadOnlyList<Error> Errors { get; }

    public bool IsSuccess => Errors.Count == 0;

    public static Result<T> Success(T value) => new(value, []);

    public static Result<T> Failure(params Error[] errors) => new(default, errors);

    public static Result<T> Failure(IReadOnlyList<Error> errors) => new(default, errors);
}
