import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { HomeComponent } from './home/home.component';

const routes: Routes = [
  {
    path: '',
    component: HomeComponent
  },
  {
    path: 'material',
    loadChildren: () => import('./material/material.module').then(m => m.MaterialModule)
  },
  {
    path: 'page3',
    loadChildren: () => import('./page3/page3.module').then(m => m.Page3Module)
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule { }
