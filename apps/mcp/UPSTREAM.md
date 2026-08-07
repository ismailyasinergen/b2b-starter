# Upstream mapping

Source repository: `medusajs/b2b-starter`
Pinned inspection commit: `3b0feaeacd4175dd6a8a5e87b991ff75dd84a96d`
Inspection date: 2026-08-07

Mapped custom APIs:

- Store companies: `/store/companies`, `/store/companies/:id`
- Store employees: `/store/companies/:id/employees`, `/store/companies/:id/employees/:employee_id`
- Store approval settings: `/store/companies/:id/approval-settings`
- Store approvals: `/store/approvals`, `/store/approvals/:id`
- Store quotes: `/store/quotes`, `/store/quotes/:id`, `/:id/messages`, `/:id/accept`, `/:id/reject`, `/:id/preview`
- Store bulk cart: `/store/carts/:id/line-items/bulk`
- Admin companies and employees: `/admin/companies...`
- Admin quotes: `/admin/quotes`, `/:id`, `/:id/messages`, `/:id/send`, `/:id/reject`

The adapter intentionally keeps tokens in environment variables and does not expose login/password tools.
