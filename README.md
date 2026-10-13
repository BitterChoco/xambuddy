# PetCareCompanion

A React Native / Expo app for browsing pet categories, reviewing general care notes, and saving favorite categories or individual pets.

## Personal care tools

Open **My pets, reminders & journal** from Home to manage local pet profiles, record time-stamped health/meal/weight/vet notes, and schedule one-time or recurring care reminders. Personal profiles and records are stored only on the device with AsyncStorage; they are not uploaded or included in the remote data bundle. Recurring reminders schedule the next occurrence when you mark the current one complete. Notification permission is requested when a reminder is created. Android system alerts require a development or production build; Android Expo Go keeps reminders in-app because the SDK 57 notification module cannot be loaded there. Android may also require enabling **Alarms & reminders** in the device's special app access settings. Web reminders are in-app only.

Tap a pet profile to open its details and dedicated healthcare history. Records can be kept separately for vet visits, 4-in-1 and anti-rabies vaccines, deworming, other vaccines, and other healthcare, with calendar-selected date given, optional next due date, clinic/provider, and notes. Choose **Custom** to enter a custom type for that record; custom records are labeled with the entered name followed by **• (Custom)**. A next-due date can create an in-app/device reminder automatically or be added later from the record. Tap the profile or gallery photo to view it full screen.

The Pets List search also looks through care notes and pet traits. Topic chips filter by nutrition, behavior, habitat, and health. Individual guides link to related entries where available and display matching source citations; the content currently does not provide topic-specific review dates, which the app states explicitly rather than implying a review date.

## Run the app

```sh
npm install
npx expo start
```

Choose Android or iOS in the Expo CLI, or press `w` to use the web preview.

## Update the pet library

Edit [src/data/pets.json](src/data/pets.json) to add categories or change their `name`, `type`, `logo`, default `favorite` flag, and `accent`. A logo can be an emoji such as `🐕` or a full image URL.

Edit [src/data/categories.json](src/data/categories.json) to update a category's general `description`, `careTips`, and its `pets` list. Each pet type has a unique `id`, `name`, `type`, and `description`. Category IDs in both files must match. On a category information screen, the **Quick select** dropdown can search pet types by name or type; selecting an entry opens its Pet Information screen.

Edit [src/data/pet_details.json](src/data/pet_details.json) to customize each pet's sample picture, traits, diet, mating and breeding notes, age-stage behavior, and age comparison table. Each record's `petId` must match a pet ID in `categories.json`; the sample picture can be an emoji or an image URL.

Edit [src/data/settings.json](src/data/settings.json) to set the initial theme and favorites-filter preference or change the available theme options. The Settings screen is available from the Home and Pets List header gear buttons. User selections are saved on-device using AsyncStorage and take precedence over these defaults.

The starter library includes Dog, Cat, Fish, Parrot Fish, Hedgehog, Snake, Hamster, Turtle, and Hermit Crab categories, with 22 example types. Each category has types in `categories.json`; pet-specific detail records are in `pet_details.json`. Favorite category and pet IDs are stored on the device using AsyncStorage.

Care information is general example content. Diet, breeding, and age guidance can vary by species and individual; consult an appropriate veterinarian or species-care professional before making care or breeding decisions. Pet-to-human age comparisons are approximate and are not meaningful for every animal group. Cat heat-cycle frequency and postpartum timing cite VCA Animal Hospitals and a 2023 peer-reviewed study; cat life-stage bands cite AAFP/AAHA guidance. See the `_sources` entries in `pet_details.json`.