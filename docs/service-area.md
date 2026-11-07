# Service area

Online booking accepts a ride only when every non-airport end is in a served town. The customer sees **Sorry, we don't service that area.** The message has no phone number and does not ask them to call.

Served towns, all in North Carolina: Denver, Sherrills Ford, Terrell, Catawba, Maiden, Pumpkin Center, Iron Station, Lowesville, and Westport.

Not served, even when the address omits the state: Charlotte, Mooresville, Davidson, Huntersville, Cornelius, Troutman, and Statesville.

Charlotte Douglas (CLT), Concord Regional, and private airfields (a place written as an airpark, airfield, airstrip, or private airport, not a street such as Airpark Drive) are airport ends. That end may be outside the towns. The other end still has to be a served town. On a trip with no airport, both ends have to be served towns.

## How an address is decided

The checker lives in `js/service-area.js`. The booking form calls it before it posts to Google Forms and before it posts to the calendar Apps Script.

1. A typed town plus `NC` or `North Carolina` is accepted only when the town is on the served list. `Denver` by itself is not accepted, so it is not confused with Denver, Colorado. `Denver CO` or `Denver, Colorado` is refused.
2. A ZIP is accepted on its own only when the post office city is a served town and the ZIP is not shared with a town we do not serve.
3. A ZIP or town on the not-served list is refused even when the street is incomplete. `282xx` is Charlotte's ZIP range, including 28262 (8109 Pike Road).
4. When the typed address does not decide the town, the form asks the Census geocoder. A returned North Carolina city that is not on the served list is refused. If the geocoder does not return a city and state, the form does not book the ride and asks for the town and state: "Please include the town and state, for example Denver, NC."
5. A shared ZIP is never enough by itself. If the geocoder then names a city, that city is what counts.

Served ZIPs: 28037 Denver (Westport mail uses this ZIP too), 28080 Iron Station, 28609 Catawba, 28650 Maiden, 28673 Sherrills Ford, 28682 Terrell.

Not-served ZIPs: 28031 Cornelius, 28035 and 28036 Davidson, 28070 and 28078 Huntersville, 28115 and 28117 Mooresville, 28166 Troutman, 28625, 28677, and 28687 Statesville, plus the 282xx Charlotte range.

## ZIPs that were not guessed

- **28164** is shared by Lowesville (served) and Stanley (not served). The ZIP alone is not accepted. The address must name Lowesville, or the geocoder must return Lowesville. Stanley is refused.
- **Pumpkin Center** and **Westport** have no ZIP of their own. Westport is mailed as Denver 28037, which is served. Pumpkin Center is accepted when the address names it. **28092** is Lincolnton and is not a served ZIP.
- **28677** is Statesville. Postal aliases include East Monbo and Eufola. They are not on the served-town list, so they are not accepted.
- **28078** is Huntersville. Aliases include Caldwell, Hicks Crossroads, and Long Creek. They are not served towns.
- **28227** is in Charlotte's ZIP range and also reaches Mint Hill. Mint Hill is not served, so the whole 282xx range is refused.

## What still needs the owner

The calendar event is created by the Google Apps Script web app. That project is not in this repository. The website refuses before it sends the post. A person who posts straight to the script URL would skip this check until the same `evaluateTrip` rule is added inside that script.
