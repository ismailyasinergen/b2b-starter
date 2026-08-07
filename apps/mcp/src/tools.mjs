const S = {
  id: { type: "string", minLength: 1 },
  optionalString: { type: "string" },
  bool: { type: "boolean" },
  number: { type: "number" },
}

const objectSchema = (properties = {}, required = [], extra = false) => ({
  type: "object",
  properties,
  required,
  additionalProperties: extra,
})

const queryProps = {
  fields: S.optionalString,
  limit: { type: "integer", minimum: 1, maximum: 100 },
  offset: { type: "integer", minimum: 0 },
}

const companyCreateProps = {
  name: S.id,
  email: S.id,
  currency_code: S.id,
  phone: S.optionalString,
  address: S.optionalString,
  city: S.optionalString,
  state: S.optionalString,
  zip: S.optionalString,
  country: S.optionalString,
  logo_url: S.optionalString,
  spending_limit_reset_frequency: {
    type: "string",
    enum: ["never", "daily", "weekly", "monthly", "yearly"],
  },
}

const readOnly = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true }
const mutate = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true }
const destructive = { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true }

function queryFrom(args, keys = Object.keys(queryProps)) {
  return Object.fromEntries(keys.filter((k) => args[k] !== undefined).map((k) => [k, args[k]]))
}

function omit(args, keys) {
  return Object.fromEntries(Object.entries(args).filter(([k, v]) => !keys.includes(k) && v !== undefined))
}

export function createTools(client, env = process.env) {
  const allowWrites = String(env.MCP_ALLOW_WRITES || "false").toLowerCase() === "true"
  const write = (fn) => async (args) => {
    if (!allowWrites) throw new Error("Write tools are disabled. Set MCP_ALLOW_WRITES=true to enable B2B mutations.")
    return fn(args)
  }

  const defs = [
    {
      name: "b2b_health",
      description: "Check whether the Medusa backend is reachable.",
      inputSchema: objectSchema(), annotations: readOnly,
      run: () => client.request({ path: "/health", scope: "public" }),
    },

    // Store/customer B2B company tools.
    {
      name: "store_create_company",
      description: "Create a B2B company as an authenticated customer.",
      inputSchema: objectSchema(companyCreateProps, ["name", "email", "currency_code"]), annotations: mutate,
      run: write((args) => client.request({ method: "POST", path: "/store/companies", scope: "store", body: args })),
    },
    {
      name: "store_get_company",
      description: "Retrieve one B2B company by id.",
      inputSchema: objectSchema({ company_id: S.id, fields: S.optionalString }, ["company_id"]), annotations: readOnly,
      run: ({ company_id, fields }) => client.request({ path: `/store/companies/${encodeURIComponent(company_id)}`, scope: "store", query: { fields } }),
    },
    {
      name: "store_update_company",
      description: "Update B2B company profile fields.",
      inputSchema: objectSchema({ company_id: S.id, ...Object.fromEntries(Object.entries(companyCreateProps).map(([k,v]) => [k, v])) }, ["company_id"]), annotations: mutate,
      run: write(({ company_id, ...body }) => client.request({ method: "POST", path: `/store/companies/${encodeURIComponent(company_id)}`, scope: "store", body })),
    },
    {
      name: "store_list_employees",
      description: "List employees for a B2B company.",
      inputSchema: objectSchema({ company_id: S.id, ...queryProps }, ["company_id"]), annotations: readOnly,
      run: ({ company_id, ...args }) => client.request({ path: `/store/companies/${encodeURIComponent(company_id)}/employees`, scope: "store", query: queryFrom(args) }),
    },
    {
      name: "store_add_employee",
      description: "Add an existing customer to a company. Requires company_admin role.",
      inputSchema: objectSchema({ company_id: S.id, customer_id: S.id, spending_limit: S.number, is_admin: S.bool }, ["company_id", "customer_id"]), annotations: mutate,
      run: write(({ company_id, ...body }) => client.request({ method: "POST", path: `/store/companies/${encodeURIComponent(company_id)}/employees`, scope: "store", body })),
    },
    {
      name: "store_get_employee",
      description: "Retrieve one company employee.",
      inputSchema: objectSchema({ company_id: S.id, employee_id: S.id, fields: S.optionalString }, ["company_id", "employee_id"]), annotations: readOnly,
      run: ({ company_id, employee_id, fields }) => client.request({ path: `/store/companies/${encodeURIComponent(company_id)}/employees/${encodeURIComponent(employee_id)}`, scope: "store", query: { fields } }),
    },
    {
      name: "store_update_employee",
      description: "Update employee spending limit or company-admin flag. Requires company_admin role.",
      inputSchema: objectSchema({ company_id: S.id, employee_id: S.id, spending_limit: S.number, is_admin: S.bool }, ["company_id", "employee_id"]), annotations: mutate,
      run: write(({ company_id, employee_id, ...body }) => client.request({ method: "POST", path: `/store/companies/${encodeURIComponent(company_id)}/employees/${encodeURIComponent(employee_id)}`, scope: "store", body })),
    },
    {
      name: "store_set_approval_settings",
      description: "Enable or disable company-admin approval requirement. Requires company_admin role.",
      inputSchema: objectSchema({ company_id: S.id, requires_admin_approval: S.bool }, ["company_id", "requires_admin_approval"]), annotations: mutate,
      run: write(({ company_id, ...body }) => client.request({ method: "POST", path: `/store/companies/${encodeURIComponent(company_id)}/approval-settings`, scope: "store", body })),
    },

    // Store/customer approval tools.
    {
      name: "store_list_approvals",
      description: "List approval-bearing carts for the authenticated customer's company.",
      inputSchema: objectSchema({ status: { oneOf: [{ type: "string" }, { type: "array", items: { type: "string" } }] }, ...queryProps }), annotations: readOnly,
      run: (args) => client.request({ path: "/store/approvals", scope: "store", query: queryFrom(args, ["status", "fields", "limit", "offset"]) }),
    },
    {
      name: "store_update_approval",
      description: "Approve/reject or otherwise update an approval status by id.",
      inputSchema: objectSchema({ approval_id: S.id, status: S.id }, ["approval_id", "status"]), annotations: mutate,
      run: write(({ approval_id, status }) => client.request({ method: "POST", path: `/store/approvals/${encodeURIComponent(approval_id)}`, scope: "store", body: { status } })),
    },

    // Store/customer quote tools.
    {
      name: "store_list_quotes",
      description: "List quotes owned by the authenticated customer.",
      inputSchema: objectSchema({ q: S.optionalString, status: S.optionalString, draft_order_id: S.optionalString, ...queryProps }), annotations: readOnly,
      run: (args) => client.request({ path: "/store/quotes", scope: "store", query: queryFrom(args, ["q", "status", "draft_order_id", "fields", "limit", "offset"]) }),
    },
    {
      name: "store_get_quote",
      description: "Retrieve one quote owned by the authenticated customer.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: readOnly,
      run: ({ quote_id, fields }) => client.request({ path: `/store/quotes/${encodeURIComponent(quote_id)}`, scope: "store", query: { fields } }),
    },
    {
      name: "store_create_quote",
      description: "Request a quote for a cart.",
      inputSchema: objectSchema({ cart_id: S.id, fields: S.optionalString }, ["cart_id"]), annotations: mutate,
      run: write(({ cart_id, fields }) => client.request({ method: "POST", path: "/store/quotes", scope: "store", query: { fields }, body: { cart_id } })),
    },
    {
      name: "store_quote_message",
      description: "Send a customer message on a quote; optionally attach it to an item.",
      inputSchema: objectSchema({ quote_id: S.id, text: S.id, item_id: S.optionalString, fields: S.optionalString }, ["quote_id", "text"]), annotations: mutate,
      run: write(({ quote_id, fields, ...body }) => client.request({ method: "POST", path: `/store/quotes/${encodeURIComponent(quote_id)}/messages`, scope: "store", query: { fields }, body })),
    },
    {
      name: "store_accept_quote",
      description: "Accept a merchant quote as the authenticated customer.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: mutate,
      run: write(({ quote_id, fields }) => client.request({ method: "POST", path: `/store/quotes/${encodeURIComponent(quote_id)}/accept`, scope: "store", query: { fields }, body: {} })),
    },
    {
      name: "store_reject_quote",
      description: "Reject a merchant quote as the authenticated customer.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: mutate,
      run: write(({ quote_id, fields }) => client.request({ method: "POST", path: `/store/quotes/${encodeURIComponent(quote_id)}/reject`, scope: "store", query: { fields }, body: {} })),
    },
    {
      name: "store_preview_quote",
      description: "Preview a quote and its calculated draft-order/cart state.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: readOnly,
      run: ({ quote_id, fields }) => client.request({ path: `/store/quotes/${encodeURIComponent(quote_id)}/preview`, scope: "store", query: { fields } }),
    },
    {
      name: "store_bulk_add_to_cart",
      description: "Add multiple variants to a cart in one B2B bulk operation.",
      inputSchema: objectSchema({
        cart_id: S.id,
        line_items: { type: "array", minItems: 1, items: objectSchema({ variant_id: S.id, quantity: { type: "integer", minimum: 1 } }, ["variant_id", "quantity"]) },
        fields: S.optionalString,
      }, ["cart_id", "line_items"]), annotations: mutate,
      run: write(({ cart_id, line_items, fields }) => client.request({ method: "POST", path: `/store/carts/${encodeURIComponent(cart_id)}/line-items/bulk`, scope: "store", query: { fields }, body: { line_items } })),
    },

    // Admin/merchant B2B tools.
    {
      name: "admin_list_companies",
      description: "List B2B companies from the merchant/admin API.",
      inputSchema: objectSchema(queryProps), annotations: readOnly,
      run: (args) => client.request({ path: "/admin/companies", scope: "admin", query: queryFrom(args) }),
    },
    {
      name: "admin_get_company",
      description: "Retrieve a B2B company through the admin API.",
      inputSchema: objectSchema({ company_id: S.id, fields: S.optionalString }, ["company_id"]), annotations: readOnly,
      run: ({ company_id, fields }) => client.request({ path: `/admin/companies/${encodeURIComponent(company_id)}`, scope: "admin", query: { fields } }),
    },
    {
      name: "admin_create_company",
      description: "Create a B2B company through the merchant/admin API.",
      inputSchema: objectSchema(omitSchema(companyCreateProps, ["spending_limit_reset_frequency"]), ["name", "email", "currency_code"]), annotations: mutate,
      run: write((body) => client.request({ method: "POST", path: "/admin/companies", scope: "admin", body })),
    },
    {
      name: "admin_update_company",
      description: "Update a B2B company through the merchant/admin API.",
      inputSchema: objectSchema({ company_id: S.id, ...omitSchema(companyCreateProps, ["spending_limit_reset_frequency"]) }, ["company_id"]), annotations: mutate,
      run: write(({ company_id, ...body }) => client.request({ method: "POST", path: `/admin/companies/${encodeURIComponent(company_id)}`, scope: "admin", body })),
    },
    {
      name: "admin_list_employees",
      description: "List employees of a company from the admin API.",
      inputSchema: objectSchema({ company_id: S.id, ...queryProps }, ["company_id"]), annotations: readOnly,
      run: ({ company_id, ...args }) => client.request({ path: `/admin/companies/${encodeURIComponent(company_id)}/employees`, scope: "admin", query: queryFrom(args) }),
    },
    {
      name: "admin_add_employee",
      description: "Attach an existing customer to a company as an employee.",
      inputSchema: objectSchema({ company_id: S.id, customer_id: S.id, spending_limit: S.number, is_admin: S.bool }, ["company_id", "customer_id"]), annotations: mutate,
      run: write(({ company_id, ...body }) => client.request({ method: "POST", path: `/admin/companies/${encodeURIComponent(company_id)}/employees`, scope: "admin", body })),
    },
    {
      name: "admin_update_employee",
      description: "Update employee role/spending settings through the admin API.",
      inputSchema: objectSchema({ company_id: S.id, employee_id: S.id, spending_limit: S.number, is_admin: S.bool }, ["company_id", "employee_id"]), annotations: mutate,
      run: write(({ company_id, employee_id, ...rest }) => client.request({ method: "POST", path: `/admin/companies/${encodeURIComponent(company_id)}/employees/${encodeURIComponent(employee_id)}`, scope: "admin", body: { id: employee_id, ...rest } })),
    },
    {
      name: "admin_set_approval_settings",
      description: "Set admin and sales-manager approval requirements for a company.",
      inputSchema: objectSchema({ company_id: S.id, settings_id: S.id, requires_admin_approval: S.bool, requires_sales_manager_approval: S.bool }, ["company_id", "settings_id", "requires_admin_approval", "requires_sales_manager_approval"]), annotations: mutate,
      run: write(({ company_id, settings_id, ...rest }) => client.request({ method: "POST", path: `/admin/companies/${encodeURIComponent(company_id)}/approval-settings`, scope: "admin", body: { id: settings_id, ...rest } })),
    },
    {
      name: "admin_list_quotes",
      description: "List customer quote requests from the merchant/admin API.",
      inputSchema: objectSchema({ q: S.optionalString, status: S.optionalString, draft_order_id: S.optionalString, ...queryProps }), annotations: readOnly,
      run: (args) => client.request({ path: "/admin/quotes", scope: "admin", query: queryFrom(args, ["q", "status", "draft_order_id", "fields", "limit", "offset"]) }),
    },
    {
      name: "admin_get_quote",
      description: "Retrieve a quote through the merchant/admin API.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: readOnly,
      run: ({ quote_id, fields }) => client.request({ path: `/admin/quotes/${encodeURIComponent(quote_id)}`, scope: "admin", query: { fields } }),
    },
    {
      name: "admin_send_quote",
      description: "Send/finalize a negotiated quote to the customer.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: mutate,
      run: write(({ quote_id, fields }) => client.request({ method: "POST", path: `/admin/quotes/${encodeURIComponent(quote_id)}/send`, scope: "admin", query: { fields }, body: {} })),
    },
    {
      name: "admin_reject_quote",
      description: "Reject a customer's quote request from the merchant side.",
      inputSchema: objectSchema({ quote_id: S.id, fields: S.optionalString }, ["quote_id"]), annotations: mutate,
      run: write(({ quote_id, fields }) => client.request({ method: "POST", path: `/admin/quotes/${encodeURIComponent(quote_id)}/reject`, scope: "admin", query: { fields }, body: {} })),
    },
    {
      name: "admin_quote_message",
      description: "Send a merchant/admin message on a quote.",
      inputSchema: objectSchema({ quote_id: S.id, text: S.id, item_id: S.optionalString, fields: S.optionalString }, ["quote_id", "text"]), annotations: mutate,
      run: write(({ quote_id, fields, ...body }) => client.request({ method: "POST", path: `/admin/quotes/${encodeURIComponent(quote_id)}/messages`, scope: "admin", query: { fields }, body })),
    },
  ]

  return defs
}

function omitSchema(schema, keys) {
  return Object.fromEntries(Object.entries(schema).filter(([key]) => !keys.includes(key)))
}

export function publicTool(tool) {
  const { run, ...spec } = tool
  return spec
}
