# PriceLabs API Documentation

This directory contains OpenAPI specifications for PriceLabs APIs used in the HOSTLYFT project.

## Available APIs

### 1. PriceLabs Customer API
**File:** `pricelabs-customer-api.yaml`

**Description:** The Customer API allows users to import PriceLabs' dynamic prices per listing into any system. Prices are updated every 24 hours.

**Key Features:**
- Get all listings with pricing and performance metrics
- Retrieve listing-specific prices with date ranges
- Access reservation data from connected PMS
- Manage date-specific overrides (DSO)
- Get neighborhood market data

**Base URL:** `https://api.pricelabs.co`

**Authentication:** API Key (X-API-Key header)

**Rate Limits:** 
- 60 requests per minute
- 1000 requests per hour

**Documentation Links:**
- SwaggerHub: https://app.swaggerhub.com/apis/Customer_API/customer_api/1.0.0-oas3
- Help Center: https://help.pricelabs.co/portal/en/kb/articles/pricelabs-api

**Main Endpoints:**
- `GET /v1/listings` - Get all listings
- `POST /v1/listing_prices` - Get prices for specific listings
- `GET /v1/reservation_data` - Get reservation data
- `GET /v1/neighborhood_data` - Get market data

---

### 2. PriceLabs Connector API (Integration API)
**File:** `pricelabs-connector-api.yaml`

**Description:** The Connector API (Integration API) allows Property Management Systems (PMS) to integrate with PriceLabs for dynamic pricing and revenue management. This API is used by commercial or custom PMSs to access PriceLabs' dynamic pricing product.

**Key Features:**
- Update or create listings in PriceLabs
- Send reservation data to PriceLabs
- Manage rate plans for multi-rate properties
- Update rates and availability via calendar endpoint
- Receive pricing recommendations from PriceLabs
- Synchronize data between PMS and PriceLabs

**Base URL:** `https://api.pricelabs.co/v1/integration/api`

**Authentication:** 
- X-INTEGRATION-TOKEN (Partner token provided by PriceLabs)
- X-INTEGRATION-NAME (PMS identifier provided by PriceLabs)

**Rate Limits:** 
- 300 requests per minute

**Documentation Links:**
- SwaggerHub v1: https://app.swaggerhub.com/apis/PriceLabs/price-labs_connector/1.0.0
- SwaggerHub v2 (Latest): https://app.swaggerhub.com/apis-docs/PriceLabs/price-labs_connector/2.0.0
- Integration Guide: https://docs.google.com/document/d/e/2PACX-1vQ4OB_ix8QwNrzayEWKRj4OS-8ylJS8nrTfyKzT9fxJtKKhMjfpwAvYqUUzHub6gvhsk9Nm3V8MU5kz/pub

**Main Endpoints:**
- `POST /listings` - Update or create listings
- `POST /calendar` - Update rates and availability
- `POST /reservations` - Update property reservations
- `POST /rate_plans` - Add or update rate plans
- `POST /get_prices` - Pull pricing data from PriceLabs
- `POST /integration` - Update integration settings
- `POST /status` - Query current state of objects

---

## Usage

### Viewing the API Specifications

You can view these OpenAPI specifications using:

1. **SwaggerHub** - Upload the YAML files to SwaggerHub for interactive documentation
2. **Swagger Editor** - Use the online editor at https://editor.swagger.io/
3. **VS Code** - Install the "OpenAPI (Swagger) Editor" extension
4. **Postman** - Import the OpenAPI files to generate API collections

### Getting API Access

To use these APIs:

1. **Customer API:**
   - Enable the Customer API in your PriceLabs account
   - Navigate to Settings => API Details
   - Copy your API key
   - Include it in the `X-API-Key` header for all requests

2. **Connector API:**
   - Contact PriceLabs support at support@pricelabs.co
   - Request PMS integration credentials
   - Follow the integration guidelines provided

### Example Request

```bash
# Get all listings using Customer API
curl -X GET "https://api.pricelabs.co/v1/listings" \
  -H "X-API-Key: YOUR_API_KEY_HERE"
```

```bash
# Get pricing for specific listings
curl -X POST "https://api.pricelabs.co/v1/listing_prices" \
  -H "X-API-Key: YOUR_API_KEY_HERE" \
  -H "Content-Type: application/json" \
  -d '{
    "listings": [
      {
        "id": "12345",
        "pms": "airbnb",
        "dateFrom": "2026-06-01",
        "dateTo": "2026-06-30"
      }
    ]
  }'
```

---

## Integration Notes

### Best Practices

1. **Rate Limiting:** Respect the API rate limits (60 req/min, 1000 req/hour)
2. **Timeout:** Set client timeout to 300 seconds for API requests
3. **Error Handling:** Implement proper error handling for API responses
4. **Caching:** Cache pricing data appropriately to reduce API calls
5. **Webhooks:** Consider implementing webhooks for real-time updates (if available)

### Common Use Cases

1. **Daily Price Sync:** Retrieve updated prices daily for all listings
2. **Reservation Updates:** Send new/modified/cancelled reservations to PriceLabs
3. **Market Analysis:** Pull neighborhood data for competitive analysis
4. **Performance Tracking:** Monitor occupancy and revenue metrics

---

## Support

For API support and questions:
- **Email:** support@pricelabs.co
- **Website:** http://pricelabs.co
- **Help Center:** https://help.pricelabs.co/

---

## Related Documentation

- Main project documentation: `../../AI Agents/PriceLabs Daily Reports/docs/`
- Existing API endpoints: `../../AI Agents/PriceLabs Daily Reports/docs/api/endpoints.md`
- PriceLabs OpenAPI spec: `../../AI Agents/PriceLabs Daily Reports/docs/api/pricelabs-openapi.yaml`

---

*Last Updated: May 31, 2026*
