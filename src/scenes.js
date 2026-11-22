// -----------------------------------------------------------------------------
// Scene action handlers (manifest `scene_actions`, Gladys 5.1+). The fields
// are strings, so a scene variable fits too (`{{triggerEvent.data.item}}`).
//
//   - `create_issue`: open an issue ("the washing machine reports an error",
//     "the backup failed" from another integration's trigger);
//   - `create_user_story`: add a user story to the backlog (a button, a
//     voice command, a monthly reminder).
// -----------------------------------------------------------------------------

import { KINDS } from './taiga/model.js';

export const SCENE_ACTIONS = {
  async create_issue(hub, { fields = {} }) {
    return hub.createItem(KINDS.ISSUE, fields);
  },

  async create_user_story(hub, { fields = {} }) {
    return hub.createItem(KINDS.USER_STORY, fields);
  },
};
