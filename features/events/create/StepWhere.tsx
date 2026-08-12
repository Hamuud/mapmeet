import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';

import { AddressField } from '@/components/events/AddressField';
import { PrimaryButton } from '@/components/ui/PrimaryButton';
import { useToast } from '@/components/ui/Toast';
import { useT, useTMaybe } from '@/i18n';
import { useLocation } from '@/hooks/useLocation';
import type { LatLng } from '@/types';

import { StepHeading } from './StepHeading';
import type { StepProps } from './types';

type Props = StepProps & {
  /** Keep the map's pending marker in sync with the form. */
  onCoordsChange: (coords: LatLng | null) => void;
  /** Close the sheet and let the next map tap place the pin. */
  onRequestPickLocation: () => void;
};

/** Step 4 — where it happens.
 *
 *  This is the one step that can leave the sheet: "Pick on map" closes
 *  it, arms pick mode, and the map reopens it once the user taps. The
 *  wizard keeps its position while that happens, so they come back to
 *  this step with the pin filled in. */
export function StepWhere({
  form,
  onCoordsChange,
  onRequestPickLocation,
}: Props) {
  const t = useT();
  const te = useTMaybe();
  const toast = useToast();
  const { coords: currentCoords, request } = useLocation();
  const {
    setValue,
    watch,
    formState: { errors },
  } = form;

  const latitude = watch('latitude');
  const longitude = watch('longitude');
  const address = watch('address');
  const hasPin = !!latitude && !!longitude;

  const useCurrentLocation = async () => {
    await request();
    if (currentCoords) {
      setValue('latitude', currentCoords.latitude);
      setValue('longitude', currentCoords.longitude);
      // Coords no longer come from the address search — clear the stale
      // venue label rather than displaying an address the pin left.
      setValue('address', null);
      onCoordsChange(currentCoords);
      toast.show(t('createEvent.pinnedToLocation'), 'success');
    }
  };

  return (
    <View className="gap-5">
      <StepHeading
        title={t('createEvent.whereTitle')}
        hint={t('createEvent.whereHint')}
      />

      {/* Pin state — the answer to "did that work?", so it sits above
          the controls rather than buried under them. */}
      <View
        className={[
          'flex-row items-center gap-3 rounded-2xl border p-4',
          hasPin
            ? 'border-accent-400/40 bg-accent-400/5'
            : 'border-border-light bg-elevated-light dark:border-border-dark dark:bg-elevated-dark',
        ].join(' ')}
      >
        <Ionicons
          name={hasPin ? 'location' : 'location-outline'}
          size={18}
          color={hasPin ? '#FE5800' : '#8B8880'}
        />
        <View className="flex-1">
          <Text
            className="text-[13px] font-semibold text-text-light dark:text-text-dark"
            numberOfLines={2}
          >
            {hasPin ? (address ?? t('createEvent.pinDropped')) : t('createEvent.noPin')}
          </Text>
          {hasPin ? (
            <Text className="mt-0.5 font-mono text-[11px] text-muted-light dark:text-muted-dark">
              {latitude.toFixed(5)}, {longitude.toFixed(5)}
            </Text>
          ) : null}
        </View>
      </View>

      {/* Address search — also captures the human-readable venue label
          so chats/peeks can show "Library" instead of raw coordinates. */}
      <AddressField
        onSelect={(hit) => {
          setValue('latitude', hit.coords.latitude);
          setValue('longitude', hit.coords.longitude);
          setValue('address', hit.label);
          onCoordsChange(hit.coords);
          toast.show(t('createEvent.pinnedToAddress'), 'success');
        }}
      />

      {/* Stacked full-width so labels never wrap — side-by-side they
          each broke onto two lines inside the 380px desktop rail. */}
      <View className="gap-2">
        <PrimaryButton
          label={t('createEvent.pickOnMap')}
          variant="secondary"
          leftIcon={<Ionicons name="map" size={15} color="#4B5FE0" />}
          onPress={onRequestPickLocation}
          fullWidth
        />
        <PrimaryButton
          label={t('createEvent.useMyLocation')}
          variant="secondary"
          leftIcon={<Ionicons name="navigate" size={15} color="#4B5FE0" />}
          onPress={useCurrentLocation}
          fullWidth
        />
      </View>

      <Text className="text-[11px] leading-snug text-muted-light dark:text-muted-dark">
        {t('createEvent.longPressTip')}
      </Text>

      {errors.latitude?.message || errors.longitude?.message ? (
        <Text className="text-xs text-red-500">
          {te(errors.latitude?.message) ?? te(errors.longitude?.message)}
        </Text>
      ) : null}
    </View>
  );
}
