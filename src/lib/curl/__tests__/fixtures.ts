export const chromeUrl = 'https://api-staging.omnix.co.id/api/report?&start_date=2026-07-01&end_date=2026-07-18&type_date=created_at&product_id=&campaign_id=';
export const secChUa = '"Not;A=Brand";v="8", "Chromium";v="150", "Google Chrome";v="150"';

export const chromeCmd = String.raw`curl ^"${chromeUrl}^" ^
  -H ^"accept: application/json, text/plain, */*^" ^
  -H ^"accept-language: en-US,en;q=0.9^" ^
  -H ^"priority: u=1, i^" ^
  -H ^"referer: https://app-staging.omnix.co.id/^" ^
  -H ^"sec-ch-ua: ^\^"Not;A=Brand^\^";v=^\^"8^\^", ^\^"Chromium^\^";v=^\^"150^\^", ^\^"Google Chrome^\^";v=^\^"150^\^"^" ^
  -H ^"sec-ch-ua-mobile: ?0^" ^
  -H ^"sec-ch-ua-platform: ^\^"Windows^\^"^" ^
  -H ^"sec-fetch-dest: empty^" ^
  -H ^"sec-fetch-mode: cors^" ^
  -H ^"sec-fetch-site: same-site^" ^
  -H ^"user-agent: Mozilla/5.0 Chrome/150.0.0.0^" ^
  -H ^"x-requested-with: XMLHttpRequest^" ^
  -b ^"Path=/; access_token=eyJ.test.token^"`;

export const chromeBash = String.raw`curl "${chromeUrl}" \
  -H "accept: application/json, text/plain, */*" \
  -H "accept-language: en-US,en;q=0.9" \
  -H "priority: u=1, i" \
  -H "referer: https://app-staging.omnix.co.id/" \
  -H "sec-ch-ua: \"Not;A=Brand\";v=\"8\", \"Chromium\";v=\"150\", \"Google Chrome\";v=\"150\"" \
  -H "sec-ch-ua-mobile: ?0" \
  -H "sec-ch-ua-platform: \"Windows\"" \
  -H "sec-fetch-dest: empty" \
  -H "sec-fetch-mode: cors" \
  -H "sec-fetch-site: same-site" \
  -H "user-agent: Mozilla/5.0 Chrome/150.0.0.0" \
  -H "x-requested-with: XMLHttpRequest" \
  -b "Path=/; access_token=eyJ.test.token"`;

export const chromePowerShell = [
  `curl.exe "${chromeUrl}" ` + '`',
  '  -H "accept: application/json, text/plain, */*" `',
  '  -H "accept-language: en-US,en;q=0.9" `',
  '  -H "priority: u=1, i" `',
  '  -H "referer: https://app-staging.omnix.co.id/" `',
  '  -H "sec-ch-ua: `"Not;A=Brand`";v=`"8`", `"Chromium`";v=`"150`", `"Google Chrome`";v=`"150`"" `',
  '  -H "sec-ch-ua-mobile: ?0" `',
  '  -H "sec-ch-ua-platform: `"Windows`"" `',
  '  -H "sec-fetch-dest: empty" `',
  '  -H "sec-fetch-mode: cors" `',
  '  -H "sec-fetch-site: same-site" `',
  '  -H "user-agent: Mozilla/5.0 Chrome/150.0.0.0" `',
  '  -H "x-requested-with: XMLHttpRequest" `',
  '  -b "Path=/; access_token=eyJ.test.token"',
].join('\n');
