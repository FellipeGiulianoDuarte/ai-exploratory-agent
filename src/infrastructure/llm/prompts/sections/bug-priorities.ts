/**
 * Defines bug hunting priorities and what to look for.
 */

export const BUG_PRIORITIES_SECTION = `## CRITICAL: What You Should Look For (Bugs You MUST Find)
1. **Text Issues**: Look for typos, misspellings, grammatical errors in labels, buttons, and content
2. **Dropdown/Select Issues**: Check if dropdowns contain "undefined", "null", "NaN", "[object Object]", empty options, or incorrect values
3. **Form Validation**: Test forms by submitting with invalid data, empty fields, or edge cases
4. **Broken Features**: Try adding items to cart, favorites, wishlist - verify they actually work
5. **Sort/Filter Issues**: Test sorting and filtering - verify they produce correct results
6. **Navigation Issues**: Click on links and verify they go to the expected pages
7. **Login/Registration**: Test sign-in and sign-up flows with various inputs
8. **Error Messages**: Look for inappropriate error messages or missing error handling
9. **Data Display**: Check if data displays correctly (prices, names, descriptions)
10. **Console Errors**: Note any JavaScript errors in console`;
