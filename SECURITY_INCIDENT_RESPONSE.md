# Security incident response: exposed secrets and customer data

## Scope

This repository previously contained files that may have exposed customer personal data and credentials. Treat every credential committed to a public repository as compromised, even if it has since been deleted from the current branch. Do not copy exposed values into issues, pull requests, chat, logs, or documentation.

## Immediate containment

1. Rotate the SMTP/email account password and revoke any app passwords, tokens, or sessions associated with it.
2. Rotate the database password and any backend/API credentials associated with the affected database project.
3. Review and revoke GitHub personal access tokens, deploy keys, OAuth authorizations, or other credentials if they may have been committed.
4. Review SMTP/email-provider, database, GitHub, and hosting-provider access logs, sessions, forwarding rules, users, and audit events for unauthorized activity.
5. Record the incident timeline, exposed file paths, remediation actions, and incident contact details in the organisation's private incident record.

## Restore service safely

1. Store newly rotated values only in the server-side environment settings of the hosting provider.
2. Never place server-only values in client-side variables or in the repository.
3. Update deployments only after validating that all required server-side variables are configured.
4. Test invoice email sending in a controlled environment using a non-production recipient before any production rollout.

## Remove data from Git history

Deleting a file in a new commit does not remove it from older commits, forks, caches, or clones. Coordinate a history rewrite using GitHub's sensitive-data removal guidance. Before rewriting:

- Preserve a private, access-controlled evidence copy if required by legal or incident-response obligations.
- Inform collaborators of the maintenance window and require fresh clones after the rewrite.
- Identify forks, tags, releases, pull-request refs, CI logs, artifacts, and external caches that may retain the data.
- Ask GitHub Support for help with cached views or inaccessible references after the rewrite, if necessary.

## Verification checklist

- [ ] Exposed credentials are rotated and old credentials are invalidated.
- [ ] Current repository state contains no real `.env` files, customer imports, credentials, or database dumps.
- [ ] Required server-side environment variables are set with the newly rotated values.
- [ ] Git history cleanup has been planned and communicated.
- [ ] The incident reporter has received an update using their required incident identifier.
- [ ] No SQL, stock, customer, supplier, invoice, or `FV263931` data changes were made as part of repository remediation.
