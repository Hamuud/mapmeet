/** Gradient ramps as one-dimensional PNGs, embedded as data URIs.
 *
 *  The colour picker used to fake its gradients with rows of flex-1
 *  slices, because there is no gradient primitive in this project — no
 *  expo-linear-gradient, no react-native-svg — and adding one means a
 *  native module, so a new build for everyone.
 *
 *  That produced hairlines. Yoga rounds each slice to whole physical
 *  pixels, the rounding leftovers land between slices, and what shows
 *  through the gap is whatever sits underneath — brighter than both
 *  neighbours. Two stacked ramps meant a grid of them, horizontal and
 *  vertical at once. More slices makes it worse, not better.
 *
 *  So: hand the interpolation to the GPU, which is what actually draws
 *  a smooth gradient. Each of these is a strip one pixel thick, stretched
 *  across the control by <Image resizeMode="stretch">; bilinear filtering
 *  fills in every step between. Three views instead of a hundred and
 *  fifty, no seams at any scale or pixel density, and it works on native
 *  and web with nothing installed.
 *
 *  Generated, not hand-written — 256 samples each, 8-bit RGBA, deflated.
 *  To change one, regenerate rather than edit: they are PNG bytes, and
 *  the CRCs at the end have to match.
 */

/** White across, opaque at the left and gone at the right. Over a solid
 *  hue this paints the saturation axis: white + hue*(s). */
export const WHITE_RAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAQAAAAABCAYAAAAxWXB3AAABiUlEQVR42iXDAwwYBgAAsNm2bdu2zc+2bdu2+c/6bNu2bXtN1qQBfv/1y5/+8Lvf/OoXP/vJj37wve986xtf+8qXvvC5z3zqEx/7yIc+8L73vOsdb3vLm97wute86hUve8mLXvC85zzrGU97ypOe8LjHPOoRD3vIgx5wv/vc6x53u8ud7nC729zqFjf7v5vc6AbXu861rnG1q1zpCv/zX5e7zKUucbGLXOgC5zvPuc5xtrOc6QynO82pTnGyk5zoBMc7zrGOcbSjHOkIhzvMoQ5xsIMc6AD728++9rG3vexpD7vbza52sbOd7GgH29vOtraxta1saQub28ymNrGxjWxoA+tbz7rWsba1/Mea1rC61axqFStbyYpWsLzlLGsZS1vKkpawuMUsahELW8iCFjC/+cxrHnOby5zmMLvZzGoWM5vJjGYwvelMaxpTm8qUpjC5yUxqEhObyIQmML7xjGscYxvLmMYwutGMahQjG8mIRjC84QxrGEMbypCGMLjBDGoQAxvIgAb4A0RAfK40hvWTAAAAAElFTkSuQmCC';

/** Black down, absent at the top and solid at the bottom — the value
 *  axis, multiplying whatever is beneath it by v. */
export const BLACK_RAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAEACAYAAAByPhyYAAABqklEQVR42i3EQxAYBgAAsNq2bdu2zdW2bdu2udVabdu2bbuXu+aRAAH+CqhACqwgCqpgCq4QCqlQCq0wCqtwCq8IiqhIiqwoiqpoiq4YiqlYiq04iqt4iq8ESqhESqwkSqpkSq4USqlUSq00Sqt0Sq8MyqhMyqwsyqpsyq4cyqlcyq08yqt8yq8CKqhCKqwiKqpiKq4SKqlSKq0yKqtyKq8KqqhKqqwqqqpqqq4aqql/VEu1VUd1VU/11UAN1UiN1URN1UzN1UIt1Uqt1UZt1U7t1UEd1Umd1UVd1U3d1UM91Uu91Ud91U/9NUADNUiDNURDNUzDNUIjNUqjNUZjNU7jNUETNUmTNUVTNU3TNUMzNUuzNUdzNU/ztUALtUiLtURLtUzL9a/+0wqt1Cqt1hqt1Tqt1wZt1Cb9r83aoq3apu3aoZ3apd3ao73ap/06oIM6pMM6oqM6puM6oZM6pdM6o7M6p/O6oIu6pMu6oqu6puu6oZu6pdu6o7u6p/t6oId6pMd6oqd6pud6oZd6pdd6o7d6p/f6oI/6pM/6oq/6pu/6oZ/6pd9/AGfdf4GudlhaAAAAAElFTkSuQmCC';

/** One full turn of hue at full saturation and value. */
export const HUE_RAMP = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAWgAAAABCAYAAADzaTTzAAABvklEQVR42qXTLVBiYRQGYIKBDQaCQYKBYMBgIFgIBIIBg4FAkGAgGDQYCBaCgWCQYCBQCAaChWAgGNhAIBg0GAgGDQaCQQKBfXb2JGZ31Nm588zcmfvznXPeOYlFIrFYrJBklRRrrLNBhk2ybJNjhzwFiuyyxz5lKlQ5pMYRJ5xS54wG5zS5oMUVbTp0uabHDX1uGXDHT0aMueeRJyY888obU96ZMWeRWMz54J0pb7zwzIQnHrhnzIghdwy4pc8NPa7p0qHNFS0uaHJOgzPqnHLCETUOqVKhzD577FKkQJ4dcmyzxSYZNkizRopVfrDCn+v3XTKepOLNdHyZiT9l48+5OCkfJxejklJUVo5Kq1F5LTo5js7q0WkjOm/GJFoxmXZMqhuT68Uk+zHZQUx6GJMfRxKPkcwkknqJ5KaR5CySlfCcGe9MeeOFZyY88cg9Y0YMuWPALX1u6HFNlw5trmhxQZNzGpxR55RjjqhxSJUKZfYpsUuRAnl2yLFNlk0ybJBmjRSrJFlZfHl9tz5Z39LS+h58c30vv7m+w6X1ffj6+v4j4NelgB/+M+DLTwI+WQr44JsBby0FvP7XgH8Bb5qAtsXi30oAAAAASUVORK5CYII=';
