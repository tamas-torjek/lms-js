Write a concise, informative commit message for the currently **staged changes**.

## Summary

The commit message should be structured as follows:

```
<type>[optional scope]: <subject>

[optional body]
```

**Subject:** Summary, imperative, start upper case, don't end with a period. No more than 72 chars.

**Body:** Explain _what_ and _why_ (not _how_). Wrap at 72 chars. Remember blank line between title and body.

The commit contains the following structural elements, to communicate intent to the consumers of your library:

1. **fix:** a commit of the _type_ `fix` patches a bug in your codebase (this correlates with `PATCH` in Semantic Versioning).
2. **feat:** a commit of the _type_ `feat` introduces a new feature to the codebase (this correlates with `MINOR` in Semantic Versioning).
3. **BREAKING CHANGE:** a commit that appends a `!` after the type/scope, introduces a breaking API change (correlating with `MAJOR` in Semantic Versioning). A BREAKING CHANGE can be part of commits of any _type_.
4. _types_ other than `fix:` and `feat:` are allowed, for example `build:`, `chore:`, `ci:`, `docs:`, `style:`, `refactor:`, `perf:`, `test:`, and others.

## Examples

### Commit message with `! to draw attention to breaking change

```
feat!: send an email to the customer when a product is shipped
```

### Commit message with scope and `!` to draw attention to breaking change

```
feat(api)!: send an email to the customer when a product is shipped
```

### Commit message with no body

```
docs: correct spelling of CHANGELOG
```

### Commit message with scope

```
feat(lang): add Polish language
```

### Commit message with multi-paragraph body

```
fix: prevent racing of requests

Introduce a request id and a reference to latest request. Dismiss
incoming responses other than from latest request.

Remove timeouts which were used to mitigate the racing issue but are
obsolete now.
```
