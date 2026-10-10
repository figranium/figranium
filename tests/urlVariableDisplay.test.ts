import assert from 'assert';
import { getUrlSummary, hasUrlVariables, normalizeUrlVariables } from '../src/components/UrlVariableDisplay';

const cases = [
    ['https://amazon.com/dp/{$asin}', 'amazon.com/dp/{$asin}'],
    ['https://amazon.com/s?k={$query}', 'amazon.com/s?k={$query}'],
    ['https://maps.google.com/maps/search/%7B$category%7D+in+%7B%24city%7D', 'maps.google.com/maps/search/{$category}+in+{$city}'],
    ['https://{$region}.example.com/products', '{$region}.example.com/products'],
] as const;

for (const [url, expected] of cases) {
    assert.strictEqual(normalizeUrlVariables(url).includes('%7B'), false, `normalizes encoded variables in ${url}`);
    assert.strictEqual(hasUrlVariables(url), true, `detects variables in ${url}`);
    assert.strictEqual(getUrlSummary(url), expected, `summarizes ${url}`);
}

assert.strictEqual(getUrlSummary('https://www.example.com/a/path?x=1'), 'example.com', 'keeps static URL summaries compact');
assert.strictEqual(hasUrlVariables('https://example.com/%7Bnot-a-variable%7D'), false, 'does not treat arbitrary encoded braces as a variable');

console.log('URL variable display tests passed');
