from odoo import models, fields, api
import requests  # Built-in Python tool to make API calls

class CrmLead(models.Model):
    _inherit = 'crm.lead'

    @api.model_create_multi
    def create(self, vals_list):
        # 1. Save the lead inside Odoo first
        records = super(CrmLead, self).create(vals_list)
        
        for lead in records:
            # 2. Package just the basic details cleanly
            payload = {
                "id": lead.id,
                "lead_name": lead.name,
                "expected_value": lead.expected_revenue,
                "details": lead.description or "No notes added."
            }
            
            # 3. Fire the data out to your temporary test URL safely
            try:
                # 🛑 PASTE YOUR COPIED WEBHOOK.SITE URL INSIDE THE QUOTES BELOW:
                test_url = "https://webhook.site/62d45913-6f16-4786-ac1c-d100c64455d9"
                
                requests.post(test_url, json=payload, timeout=3)
                print(">>> SUCCESS: Minimal lead payload sent to Webhook.site! <<<")
            except Exception as e:
                print(f">>> Webhook test failed: {e} <<<")
                
        return records
