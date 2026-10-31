# 🛡️ CheckMate (#AbHogaAsliHisab)
> *A "No-Cost EMI" Truth Calculator & CCPA Dark Pattern Auditor for Indian Consumers*

🔗 *Live Demo:* https://site-cad463cd6e0748129f63863af4a85b71.freebuff.page/ 

---

## 📌 What It Does
Indian online shoppers routinely fall for "0% / No-Cost EMI" promotions and deceptive checkout interfaces. While merchants discount the bank's nominal interest upfront, consumers still pay *upfront processing fees + 18% GST, **mandatory 18% GST on every month's interest component*, and sneaky pre-ticked add-ons.

*CheckMate* lets users drop any e-commerce or travel checkout screenshot to get an instant forensic audit in under 3 seconds:
1. *True Effective APR Engine:* Computes the exact month-by-month amortization schedule and solves for the *True Effective Annual Percentage Rate (APR)* using the Newton-Raphson Internal Rate of Return (IRR) method.
2. *Extensible Bank MITC Database:* Pre-loaded with official EMI schedules for *HDFC Bank, ICICI Bank, Bajaj Finserv Insta EMI, and SBI Card*, with runtime support for adding custom bank profiles.
3. *CCPA 2023 Consumer Rights Judge:* Flags illegal UI dark patterns (Drip Pricing, Basket Sneaking, False Urgency, Confirm Shaming, APR Omission) mapped to *Annexure 1 of India's CCPA Guidelines (2023)* and *RBI Key Facts Statement (KFS) norms*.
4. *One-Click NCH 1915 Dispute Dossier:* Auto-generates a formal complaint packet with mathematical proof ready to file on the National Consumer Helpline.

---

## 📸 Screenshots
| Landing Page (#AbHogaAsliHisab) | Forensic APR & CCPA Audit View |
<img width="959" height="402" alt="image" src="https://github.com/user-attachments/assets/3549afc6-cddf-42da-8939-fc5a129b3f9b" />
<img width="829" height="344" alt="image" src="https://github.com/user-attachments/assets/03b77d28-e7c3-4462-9170-2f0c712bf595" />
<img width="783" height="367" alt="image" src="https://github.com/user-attachments/assets/b2683e1f-062f-4bef-a2c1-c10a1cfd8c4a" />
<img width="959" height="416" alt="image" src="https://github.com/user-attachments/assets/d204e05f-5bb8-4cef-a224-b7b523801924" />


---

## 🛠️ Tech Stack
* *Frontend:* React 18, TypeScript, Vite, Tailwind CSS, Lucide Icons
* *Visual Processing (100% Open-Source):* Tesseract.js (WebAssembly client-side OCR) + Optional Meta Llama-4-Scout-17B-Vision cloud boost
* *Financial Math Engine:* Pure TypeScript Newton-Raphson IRR Solver & Reducing-Balance Amortization Calculator
* *Deployment:* Freebuff

---

## 🚀 How to Run Locally
```bash
# 1. Clone the repository
git clone https://github.com/SK007009/CheckMate-MVP.git
cd CheckMate-MVP

# 2. Install dependencies
npm install

# 3. Start the development server
npm run dev
